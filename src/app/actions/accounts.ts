"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  fail,
  isoDateSchema,
  nullableId,
  ok,
  runAction,
  type ActionState,
} from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import {
  createAccount,
  deleteAccount,
  findOrCreateInstitution,
  setArchived,
  updateAccount,
} from "@/server/accounts";
import { saveBalances } from "@/server/balances";
import { ensureEnvelopeForAccount } from "@/server/envelopes";
import { ratesForDate } from "@/server/fx";
import { rateToBase } from "@/server/balances";
import { ACCOUNT_CATEGORIES } from "@/lib/networth";
import { parseAmountToCents } from "@/lib/money";
import { today } from "@/lib/date";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["checking", "savings", "pocket", "investment", "cash", "other"]),
  category: z.enum(ACCOUNT_CATEGORIES),
  currency: z.string().trim().length(3),
  liquid: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  parentId: nullableId,
  institutionId: nullableId,
  institutionName: z.string().trim().optional(),
  ownerUserId: nullableId,
  note: z.string().trim().max(500).optional(),
});

function refresh() {
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function saveAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const redirectTo = String(formData.get("redirectTo") ?? "");
  const result = await runAction(async () => {
    const context = await requireWritableContext();
    const accountId = String(formData.get("accountId") ?? "") || undefined;

    const parsed = accountSchema.parse({
      name: formData.get("name"),
      type: formData.get("type"),
      category: formData.get("category"),
      currency: formData.get("currency"),
      liquid: formData.get("liquid") ?? "false",
      parentId: formData.get("parentId") ?? "",
      institutionId: formData.get("institutionId") ?? "",
      institutionName: formData.get("institutionName") ?? "",
      ownerUserId: formData.get("ownerUserId") ?? "",
      note: formData.get("note") ?? "",
    });

    const institutionId =
      parsed.institutionId ??
      (parsed.institutionName
        ? await findOrCreateInstitution(context.household.id, parsed.institutionName)
        : null);

    const input = {
      name: parsed.name,
      type: parsed.type,
      category: parsed.category,
      currency: parsed.currency,
      liquid: parsed.liquid,
      parentId: parsed.parentId,
      institutionId,
      ownerUserId: parsed.ownerUserId,
      note: parsed.note ?? null,
    };

    if (accountId) {
      await updateAccount(context.household.id, accountId, input);
      refresh();
      return ok({ id: accountId });
    }

    const balanceText = String(formData.get("initialBalance") ?? "").trim();
    const amount = balanceText === "" ? null : parseAmountToCents(balanceText, parsed.currency);
    if (balanceText !== "" && amount === null) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { initialBalance: "invalid" } };
    }

    const date = today();
    const rates = await ratesForDate(date);

    const id = await createAccount(
      context.household.id,
      input,
      amount === null
        ? undefined
        : {
            amount,
            date,
            rateToBase: rateToBase(parsed.currency, context.household.baseCurrency, rates),
            userId: context.user.id,
          },
    );

    // Un Pocket e una busta reale: crearla subito evita che l'utente debba
    // imparare un concetto nuovo prima di poter ripartire lo stipendio.
    if (parsed.type === "pocket" || parsed.category === "pocket" || parsed.parentId) {
      await ensureEnvelopeForAccount(context.household.id, id, parsed.name, hashColor(parsed.name));
    }

    refresh();
    return ok({ id });
  });

  if (result.status === "success" && redirectTo) redirect(redirectTo);
  return result;
}

/** Colore stabile a partire dal nome: la stessa busta non cambia tinta. */
function hashColor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 7;
}

export async function archiveAccountAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const accountId = String(formData.get("accountId") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";
  if (accountId) await setArchived(context.household.id, accountId, archived);
  refresh();
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const accountId = String(formData.get("accountId") ?? "");
  if (accountId) await deleteAccount(context.household.id, accountId);
  refresh();
}

/**
 * Salvataggio dei saldi in blocco (F1.5): una schermata, un salvataggio.
 * I campi vuoti o invariati non scrivono nulla.
 */
export async function saveBalancesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const date = isoDateSchema.parse(formData.get("date") ?? today());
    if (date > today()) return fail("balances.futureDate");

    const updates: { accountId: string; amount: number }[] = [];
    const invalid: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("balance:") || typeof value !== "string") continue;
      const accountId = key.slice("balance:".length);
      const text = value.trim();
      if (text === "") continue;

      const currency = String(formData.get(`currency:${accountId}`) ?? "EUR");
      const amount = parseAmountToCents(text, currency);
      if (amount === null) {
        invalid[key] = "invalid";
        continue;
      }

      // Un saldo identico a quello gia registrato non va riscritto.
      const previousText = String(formData.get(`previous:${accountId}`) ?? "");
      const previous = previousText === "" ? null : Number(previousText);
      if (previous !== null && previous === amount) continue;

      updates.push({ accountId, amount });
    }

    if (Object.keys(invalid).length > 0) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: invalid };
    }
    if (updates.length === 0) return ok({ messageKey: "balances.nothingToSave" });

    const result = await saveBalances(context.household.id, date, updates, {
      userId: context.user.id,
      baseCurrency: context.household.baseCurrency,
    });

    refresh();
    revalidatePath("/transactions");
    return ok({ messageKey: "balances.saved", messageValues: { count: result.saved } });
  });
}

