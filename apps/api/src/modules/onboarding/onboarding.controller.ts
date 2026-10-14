/**
 * Onboarding in tre passi: household, conti, modello di ripartizione.
 *
 * Ogni passo mette insieme piu operazioni del livello dati (household e
 * categorie, conti con saldo e busta, modello da un preset): stanno qui perche
 * il frontend fa una chiamata sola per passo.
 */
import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { today } from "@pocketly/domain/date";
import type { AccountCategory } from "@pocketly/domain/networth";
import { createHousehold, householdOf } from "@api/data/household";
import { createAccount, findOrCreateInstitution } from "@api/data/accounts";
import { ensureEnvelopeForAccount, listEnvelopes } from "@api/data/envelopes";
import { seedCategories } from "@api/data/categories";
import { saveTemplate } from "@api/data/templates";
import { rateToBase } from "@api/data/balances";
import { hasAnyRate, ratesForDate, refreshRates } from "@api/data/fx";
import { Ctx, CurrentUser, SessionOnly, Writable } from "../../common/guards";
import type { RequestContext, SessionUser } from "../../common/context";
import { cents, currency } from "../../common/schemas";

const householdSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: currency,
  timezone: z.string().trim().min(1),
  // Lingua delle categorie iniziali; una lingua sconosciuta ripiega sull'italiano.
  locale: z.enum(["it", "en"]).catch("it"),
});

const accountRow = z.object({
  index: z.string(),
  name: z.string().trim().min(1).max(80),
  type: z.enum(["checking", "savings", "pocket", "investment", "cash", "other"]),
  currency,
  parentIndex: z.string().optional(),
  institutionName: z.string().trim().optional(),
  balanceCents: cents.nullish(),
});

const accountsSchema = z.object({
  defaultPocketName: z.string().trim().max(80).optional(),
  // Le righe si validano una a una: una riga storta si salta, non blocca le altre.
  accounts: z.array(z.unknown()),
});

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

function guessCategory(name: string, isPocket: boolean): AccountCategory {
  if (isPocket) return "pocket";
  for (const [pattern, category] of CATEGORY_WORDS) {
    if (pattern.test(name)) return category;
  }
  return "operational";
}

@Controller("onboarding")
export class OnboardingController {
  /** Passo 1: household, valuta base, lingua. L'utente non ha ancora un household. */
  @SessionOnly()
  @Post("household")
  async createHousehold(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    // Un secondo invio (doppio click, pagina riaperta) non crea un altro household.
    const existing = await householdOf(user.id);
    if (existing) return { id: existing, created: false };

    const parsed = householdSchema.parse(body);
    const householdId = await createHousehold(user.id, parsed);
    await seedCategories(householdId, parsed.locale);

    // Al primo avvio si scarica lo storico dei cambi, cosi anche un saldo
    // retrodatato trova il tasso del suo giorno.
    if (!(await hasAnyRate())) {
      await refreshRates({ history: true }).catch(() => {
        // Senza rete l'app resta usabile: i totali in valuta base funzionano,
        // le altre valute entrano appena i tassi arrivano.
      });
    }
    return { id: householdId, created: true };
  }

  /**
   * Passo 2: conti e Pocket con il saldo di oggi. `parentIndex` lega un Pocket
   * al conto creato poco prima nella stessa richiesta.
   */
  @Writable()
  @Post("accounts")
  async createAccounts(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { defaultPocketName, accounts } = accountsSchema.parse(body);
    const householdId = ctx.household.id;
    const date = today();
    const rates = await ratesForDate(date);
    const createdByIndex = new Map<string, string>();
    let created = 0;

    const rows = accounts
      .map((row) => accountRow.safeParse(row))
      .filter((result) => result.success)
      .map((result) => result.data)
      // L'ordine conta: un Pocket si crea dopo il conto che lo contiene.
      .sort((a, b) => Number(a.index) - Number(b.index));

    for (const row of rows) {
      const isPocket = Boolean(row.parentIndex);
      const category = guessCategory(row.name, isPocket);
      const parentId = row.parentIndex ? (createdByIndex.get(row.parentIndex) ?? null) : null;
      const institutionId = row.institutionName
        ? await findOrCreateInstitution(householdId, row.institutionName)
        : null;
      const amount = row.balanceCents ?? null;

      const accountId = await createAccount(
        householdId,
        {
          name: row.name,
          type: row.type,
          category,
          currency: row.currency,
          // Investimenti e capitale vincolato non sono liquidi.
          liquid: category !== "investments" && category !== "guaranteed_capital",
          parentId,
          institutionId,
          ownerUserId: null,
          note: null,
          defaultPocketName,
        },
        amount === null
          ? undefined
          : {
              amount,
              date,
              rateToBase: rateToBase(row.currency, ctx.household.baseCurrency, rates),
              userId: ctx.user.id,
            },
      );

      createdByIndex.set(row.index, accountId);
      created += 1;

      // Ogni conto diventa anche una busta reale: il giorno di paga puo
      // assegnare a qualcosa fin dal primo utilizzo.
      await ensureEnvelopeForAccount(householdId, accountId, row.name, created % 7);
    }

    return { created };
  }

  /** Passo 3: modello di ripartizione da un preset. "skip" non arriva fin qui. */
  @Writable()
  @Post("template")
  async createTemplate(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { preset } = z
      .object({ preset: z.enum(["employee", "freelance"]).catch("employee") })
      .parse(body);
    const envelopes = await listEnvelopes(ctx.household.id);
    if (envelopes.length === 0) return { id: null };

    const operational =
      envelopes.find((envelope) => /operativ|corrente|checking|everyday/i.test(envelope.name)) ??
      envelopes[0]!;
    const emergency =
      envelopes.find((envelope) => /emergenz|emergency/i.test(envelope.name)) ?? operational;

    const line = (
      label: string,
      kind: "fixed" | "percent" | "remainder",
      envelopeId: string,
      priority: number,
      percentBps = 0,
    ) => ({
      id: crypto.randomUUID(),
      label,
      kind,
      envelopeId,
      amountCents: 0,
      percentBps,
      percentBasis: "gross" as const,
      priority,
    });

    const lines =
      preset === "freelance"
        ? [
            line("Accantonamento tasse", "percent", emergency.id, 1, 3000),
            line("Spese fisse", "fixed", operational.id, 2),
            line("Resto", "remainder", operational.id, 99),
          ]
        : [
            line("Spese fisse", "fixed", operational.id, 1),
            line("Fondo emergenza", "fixed", emergency.id, 2),
            line("Resto", "remainder", operational.id, 99),
          ];

    const id = await saveTemplate(ctx.household.id, {
      name: preset === "freelance" ? "Entrata" : "Stipendio",
      isDefault: true,
      lines,
    });
    return { id };
  }
}
