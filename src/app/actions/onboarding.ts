"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, runAction, type ActionState } from "@/lib/actions";
import { getSession } from "@/lib/session";
import { createHousehold, householdOf } from "@/server/household";
import { createAccount } from "@/server/accounts";
import { ensureEnvelopeForAccount } from "@/server/envelopes";
import { seedCategories } from "@/server/categories";
import { saveTemplate } from "@/server/templates";
import { rateToBase } from "@/server/balances";
import { hasAnyRate, ratesForDate, refreshRates } from "@/server/fx";
import { parseAmountToCents } from "@/lib/money";
import { isLocale } from "@/i18n/request";
import { today } from "@/lib/date";

const householdSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: z.string().trim().length(3),
  timezone: z.string().trim().min(1),
  locale: z.string().trim(),
});

/** Passo 1: household, valuta base, lingua. */
export async function createHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) redirect("/login");

    const existing = await householdOf(session.user.id);
    if (existing) redirect("/");

    const parsed = householdSchema.parse({
      name: formData.get("name"),
      baseCurrency: formData.get("baseCurrency") ?? "EUR",
      timezone: formData.get("timezone") ?? "Europe/Rome",
      locale: formData.get("locale") ?? "it",
    });

    const householdId = await createHousehold(session.user.id, parsed);
    await seedCategories(householdId, isLocale(parsed.locale) ? parsed.locale : "it");

    // Al primo avvio si scarica lo storico dei cambi, cosi anche un saldo
    // retrodatato trova il tasso del suo giorno.
    if (!(await hasAnyRate())) {
      await refreshRates({ history: true }).catch(() => {
        // Senza rete l'app resta usabile: i totali in valuta base funzionano,
        // le altre valute entrano appena i tassi arrivano.
      });
    }

    revalidatePath("/", "layout");
    return ok({ id: householdId });
  });
}

/**
 * Categoria indovinata dal nome del conto. Durante l'onboarding non si chiede
 * la categoria per non allungare il modulo, ma lasciare tutto su "operativo"
 * renderebbe muta la ripartizione del patrimonio.
 */
const CATEGORY_WORDS: [RegExp, "emergency_fund" | "guaranteed_capital" | "investments"][] = [
  [/emergenz|emergency/i, "emergency_fund"],
  [/garantit|vincolat|buoni|supersmart|deposit|libretto/i, "guaranteed_capital"],
  [/invest|etf|pac|fond(?!o emergenz)/i, "investments"],
];

function guessCategory(name: string, isPocket: boolean) {
  if (isPocket) return "pocket" as const;
  for (const [pattern, category] of CATEGORY_WORDS) {
    if (pattern.test(name)) return category;
  }
  return "operational" as const;
}

const accountRow = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["checking", "savings", "pocket", "investment", "cash", "other"]),
  category: z.enum(["operational", "pocket", "emergency_fund", "guaranteed_capital", "investments"]),
  currency: z.string().trim().length(3),
  liquid: z.boolean(),
  parentIndex: z.string().optional(),
  institutionName: z.string().trim().optional(),
  balance: z.string().optional(),
});

/**
 * Passo 2: conti e Pocket con il saldo di oggi.
 *
 * Le righe arrivano come `account.<i>.<campo>`; `parentIndex` lega un Pocket
 * al conto creato poco prima nello stesso invio.
 */
export async function createAccountsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) redirect("/login");
    const householdId = await householdOf(session.user.id);
    if (!householdId) redirect("/onboarding");

    const baseCurrency = String(formData.get("baseCurrency") ?? "EUR");
    const rows = new Map<string, Record<string, string>>();
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("account.") || typeof value !== "string") continue;
      const [, index, field] = key.split(".");
      if (!index || !field) continue;
      const row = rows.get(index) ?? {};
      row[field] = value;
      rows.set(index, row);
    }

    const date = today();
    const rates = await ratesForDate(date);
    const createdByIndex = new Map<string, string>();
    let created = 0;

    // L'ordine conta: un Pocket si crea dopo il conto che lo contiene.
    const ordered = [...rows.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));

    for (const [index, row] of ordered) {
      if (!row.name || row.name.trim() === "") continue;

      const isPocket = Boolean(row.parentIndex);
      const parsed = accountRow.safeParse({
        name: row.name,
        type: row.type ?? "checking",
        category: guessCategory(row.name, isPocket),
        currency: row.currency || baseCurrency,
        liquid: row.liquid !== "false",
        parentIndex: row.parentIndex ?? "",
        institutionName: row.institutionName ?? "",
        balance: row.balance ?? "",
      });
      if (!parsed.success) continue;

      const parentId = parsed.data.parentIndex
        ? (createdByIndex.get(parsed.data.parentIndex) ?? null)
        : null;

      const institutionId = parsed.data.institutionName
        ? await (await import("@/server/accounts")).findOrCreateInstitution(
            householdId,
            parsed.data.institutionName,
          )
        : null;

      const amount =
        parsed.data.balance && parsed.data.balance.trim() !== ""
          ? parseAmountToCents(parsed.data.balance, parsed.data.currency)
          : null;

      const accountId = await createAccount(
        householdId,
        {
          name: parsed.data.name,
          type: parsed.data.type,
          category: parsed.data.category,
          currency: parsed.data.currency,
          // Investimenti e capitale vincolato non sono liquidi.
          liquid:
            parsed.data.category !== "investments" &&
            parsed.data.category !== "guaranteed_capital",
          parentId,
          institutionId,
          ownerUserId: null,
          note: null,
        },
        amount === null
          ? undefined
          : {
              amount,
              date,
              rateToBase: rateToBase(parsed.data.currency, baseCurrency, rates),
              userId: session.user.id,
            },
      );

      createdByIndex.set(index, accountId);
      created += 1;

      // Ogni conto diventa anche una busta reale: il giorno di paga puo
      // assegnare a qualcosa fin dal primo utilizzo.
      await ensureEnvelopeForAccount(householdId, accountId, parsed.data.name, created % 7);
    }

    if (created === 0) return fail("onboarding.noAccounts");

    revalidatePath("/", "layout");
    return ok({ messageValues: { count: created } });
  });
}

/** Passo 3: modello di ripartizione, da un preset o saltato. */
export async function createTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await runAction(async () => {
    const session = await getSession();
    if (!session?.user) redirect("/login");
    const householdId = await householdOf(session.user.id);
    if (!householdId) redirect("/onboarding");

    const preset = String(formData.get("preset") ?? "skip");
    if (preset === "skip") return ok();

    const envelopes = await (await import("@/server/envelopes")).listEnvelopes(householdId);
    if (envelopes.length === 0) return ok();

    const operational =
      envelopes.find((envelope) => /operativ|corrente|checking|everyday/i.test(envelope.name)) ??
      envelopes[0]!;
    const emergency =
      envelopes.find((envelope) => /emergenz|emergency/i.test(envelope.name)) ?? operational;

    const lines =
      preset === "freelance"
        ? [
            {
              id: crypto.randomUUID(),
              label: "Accantonamento tasse",
              kind: "percent" as const,
              envelopeId: emergency.id,
              amountCents: 0,
              percentBps: 3000,
              percentBasis: "gross" as const,
              priority: 1,
            },
            {
              id: crypto.randomUUID(),
              label: "Spese fisse",
              kind: "fixed" as const,
              envelopeId: operational.id,
              amountCents: 0,
              percentBps: 0,
              percentBasis: "gross" as const,
              priority: 2,
            },
            {
              id: crypto.randomUUID(),
              label: "Resto",
              kind: "remainder" as const,
              envelopeId: operational.id,
              amountCents: 0,
              percentBps: 0,
              percentBasis: "gross" as const,
              priority: 99,
            },
          ]
        : [
            {
              id: crypto.randomUUID(),
              label: "Spese fisse",
              kind: "fixed" as const,
              envelopeId: operational.id,
              amountCents: 0,
              percentBps: 0,
              percentBasis: "gross" as const,
              priority: 1,
            },
            {
              id: crypto.randomUUID(),
              label: "Fondo emergenza",
              kind: "fixed" as const,
              envelopeId: emergency.id,
              amountCents: 0,
              percentBps: 0,
              percentBasis: "gross" as const,
              priority: 2,
            },
            {
              id: crypto.randomUUID(),
              label: "Resto",
              kind: "remainder" as const,
              envelopeId: operational.id,
              amountCents: 0,
              percentBps: 0,
              percentBasis: "gross" as const,
              priority: 99,
            },
          ];

    await saveTemplate(householdId, {
      name: preset === "freelance" ? "Entrata" : "Stipendio",
      isDefault: true,
      lines,
    });

    revalidatePath("/", "layout");
    return ok();
  });

  if (result.status === "success") redirect("/");
  return result;
}

