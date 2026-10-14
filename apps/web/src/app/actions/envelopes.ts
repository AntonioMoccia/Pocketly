"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, nullableId, ok, runAction, type ActionState } from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import { api } from "@/lib/api";
import type { MonthCloseResult } from "@/data/envelopes";
import { parseAmountToCents } from "@pocketly/domain/money";
import { today } from "@pocketly/domain/date";

function refresh(envelopeId?: string) {
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
  if (envelopeId) revalidatePath(`/envelopes/${envelopeId}`);
}

const envelopeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["real", "virtual"]),
  accountId: z.string().trim().min(1),
  leftoverPolicy: z.enum(["accumulate", "sweep"]),
  sweepToEnvelopeId: nullableId,
  color: z.coerce.number().int().min(0).max(6),
});

export async function saveEnvelopeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await requireWritableContext();
    const envelopeId = String(formData.get("envelopeId") ?? "") || undefined;

    const parsed = envelopeSchema.parse({
      name: formData.get("name"),
      kind: formData.get("kind") ?? "virtual",
      accountId: formData.get("accountId"),
      leftoverPolicy: formData.get("leftoverPolicy") ?? "accumulate",
      sweepToEnvelopeId: formData.get("sweepToEnvelopeId") ?? "",
      color: formData.get("color") ?? 0,
    });

    const { id } = envelopeId
      ? await api.put<{ id: string }>(`/envelopes/${encodeURIComponent(envelopeId)}`, parsed)
      : await api.post<{ id: string }>("/envelopes", parsed);
    refresh(id);
    return ok({ id });
  });
}

export async function archiveEnvelopeAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const envelopeId = String(formData.get("envelopeId") ?? "");
  const archived = String(formData.get("archived") ?? "true") === "true";
  if (envelopeId) {
    await api.post(`/envelopes/${encodeURIComponent(envelopeId)}/archive`, { archived });
  }
  refresh(envelopeId);
}

export async function deleteEnvelopeAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const envelopeId = String(formData.get("envelopeId") ?? "");
  if (envelopeId) await api.delete(`/envelopes/${encodeURIComponent(envelopeId)}`);
  refresh();
}

/**
 * Copre uno sforamento spostando assegnato da un'altra busta. Se le due buste
 * stanno su conti diversi nasce anche il giroconto da fare.
 */
export async function coverOverspendAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const toEnvelopeId = String(formData.get("toEnvelopeId") ?? "");
    const fromEnvelopeId = String(formData.get("fromEnvelopeId") ?? "");
    if (!toEnvelopeId || !fromEnvelopeId) return fail("errors.validation");

    const currency = String(formData.get("currency") ?? context.household.baseCurrency);
    const amount = parseAmountToCents(String(formData.get("amount") ?? ""), currency);
    if (amount === null || amount <= 0) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { amount: "invalid" } };
    }

    const result = await api.post<{ moveId: string; transferTodoId: string | null }>("/envelope-moves", {
      fromEnvelopeId,
      toEnvelopeId,
      amountCents: amount,
      reason: "overspend",
      date: today(),
    });

    refresh(toEnvelopeId);
    return ok({
      messageKey: result.transferTodoId ? "envelopes.coveredWithTransfer" : "envelopes.covered",
    });
  });
}

export async function moveEnvelopeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const fromEnvelopeId = String(formData.get("fromEnvelopeId") ?? "");
    const toEnvelopeId = String(formData.get("toEnvelopeId") ?? "");
    const currency = String(formData.get("currency") ?? context.household.baseCurrency);
    const amount = parseAmountToCents(String(formData.get("amount") ?? ""), currency);
    if (!fromEnvelopeId || !toEnvelopeId || amount === null || amount <= 0) {
      return fail("errors.validation");
    }

    await api.post("/envelope-moves", {
      fromEnvelopeId,
      toEnvelopeId,
      amountCents: amount,
      reason: "manual",
    });
    refresh(toEnvelopeId);
    return ok();
  });
}

export async function closeMonthAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await requireWritableContext();
    const month = String(formData.get("month") ?? today());

    // Il ruolo owner lo verifica l'API: un member riceve "non autorizzato".
    const result = await api.post<MonthCloseResult>("/month-closes", { month });
    refresh();

    if (result.alreadyClosed) return ok({ messageKey: "month.alreadyClosed" });
    return ok({
      messageKey: "month.closed",
      messageValues: { sweeps: result.sweeps, transfers: result.transferTodos },
    });
  });
}
