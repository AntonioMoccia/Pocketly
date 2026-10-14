"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { fail, ok, runAction, type ActionState } from "@/lib/actions";
import { getContext, getSession } from "@/lib/session";
import { api } from "@/lib/api";
import { parseAmountToCents } from "@pocketly/domain/money";

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
    if (await getContext()) redirect("/");

    const parsed = householdSchema.parse({
      name: formData.get("name"),
      baseCurrency: formData.get("baseCurrency") ?? "EUR",
      timezone: formData.get("timezone") ?? "Europe/Rome",
      locale: formData.get("locale") ?? "it",
    });

    // Categorie iniziali e primo scaricamento dei cambi li fa l'API.
    const { id, created } = await api.post<{ id: string; created: boolean }>(
      "/onboarding/household",
      parsed,
    );
    if (!created) redirect("/");

    revalidatePath("/", "layout");
    return ok({ id });
  });
}

/**
 * Passo 2: conti e Pocket con il saldo di oggi.
 *
 * Le righe arrivano come `account.<i>.<campo>`; `parentIndex` lega un Pocket
 * al conto creato poco prima nello stesso invio. I saldi si leggono qui, dove
 * si conosce la lingua in cui l'utente li ha scritti.
 */
export async function createAccountsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user) redirect("/login");
    if (!(await getContext())) redirect("/onboarding");

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

    const accounts = [...rows.entries()]
      .filter(([, row]) => row.name && row.name.trim() !== "")
      .map(([index, row]) => {
        const currency = row.currency || baseCurrency;
        const balance = (row.balance ?? "").trim();
        return {
          index,
          name: row.name,
          type: row.type ?? "checking",
          currency,
          parentIndex: row.parentIndex ?? "",
          institutionName: row.institutionName ?? "",
          // Un saldo illeggibile vale come non inserito: il conto nasce comunque.
          balanceCents: balance === "" ? null : parseAmountToCents(balance, currency),
        };
      });

    const { created } = await api.post<{ created: number }>("/onboarding/accounts", {
      defaultPocketName: (await getTranslations("accounts"))("defaultPocketName"),
      accounts,
    });

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
    if (!(await getContext())) redirect("/onboarding");

    const preset = String(formData.get("preset") ?? "skip");
    if (preset === "skip") return ok();

    await api.post("/onboarding/template", { preset });

    revalidatePath("/", "layout");
    return ok();
  });

  if (result.status === "success") redirect("/");
  return result;
}
