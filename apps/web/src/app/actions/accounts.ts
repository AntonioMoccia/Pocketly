"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
import { api } from "@/lib/api";
import { ACCOUNT_CATEGORIES } from "@pocketly/domain/networth";
import { parseAmountToCents } from "@pocketly/domain/money";
import { today } from "@pocketly/domain/date";

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
    await requireWritableContext();
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

    const input = {
      ...parsed,
      note: parsed.note ?? null,
      defaultPocketName: (await getTranslations("accounts"))("defaultPocketName"),
    };

    if (accountId) {
      await api.put(`/accounts/${encodeURIComponent(accountId)}`, input);
      refresh();
      return ok({ id: accountId });
    }

    const balanceText = String(formData.get("initialBalance") ?? "").trim();
    const amount = balanceText === "" ? null : parseAmountToCents(balanceText, parsed.currency);
    if (balanceText !== "" && amount === null) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { initialBalance: "invalid" } };
    }

    const { id } = await api.post<{ id: string }>("/accounts", { ...input, initialBalance: amount });
    refresh();
    return ok({ id });
  });

  if (result.status === "success" && redirectTo) redirect(redirectTo);
  return result;
}

export async function archiveAccountAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const accountId = String(formData.get("accountId") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";
  if (accountId) await api.post(`/accounts/${encodeURIComponent(accountId)}/archive`, { archived });
  refresh();
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const accountId = String(formData.get("accountId") ?? "");
  if (accountId) await api.delete(`/accounts/${encodeURIComponent(accountId)}`);
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
    await requireWritableContext();
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

    const result = await api.post<{ saved: number; skipped: string[] }>("/balances", { date, updates });

    refresh();
    revalidatePath("/transactions");
    return ok({ messageKey: "balances.saved", messageValues: { count: result.saved } });
  });
}

