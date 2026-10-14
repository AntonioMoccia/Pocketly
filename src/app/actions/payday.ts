"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, isoDateSchema, nullableId, ok, runAction, type ActionState } from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import {
  closePayday,
  createIncome,
  deleteIncome,
  getPayday,
  reopenPayday,
  replaceAllocations,
  setAllAllocationsDone,
  setAllocationDone,
  updateIncome,
} from "@/server/payday";
import { defaultTemplate } from "@/server/templates";
import { saveNetWorthSnapshot } from "@/server/networth";
import { parseAmountToCents } from "@/lib/money";
import { today } from "@/lib/date";
import type { AllocationLineInput } from "@/lib/allocation";

function refresh(incomeId?: string) {
  revalidatePath("/payday");
  if (incomeId) revalidatePath(`/payday/${incomeId}`);
  revalidatePath("/");
}

const incomeSchema = z.object({
  date: isoDateSchema,
  kind: z.enum(["salary", "invoice", "other"]),
  accountId: nullableId,
  templateId: nullableId,
  note: z.string().trim().max(500).optional(),
});

export async function startPaydayAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let created: string | null = null;

  const result = await runAction(async () => {
    const context = await requireWritableContext();
    const parsed = incomeSchema.parse({
      date: formData.get("date") || today(),
      kind: formData.get("kind") ?? "salary",
      accountId: formData.get("accountId") ?? "",
      templateId: formData.get("templateId") ?? "",
      note: formData.get("note") ?? "",
    });

    const currency = String(formData.get("currency") ?? context.household.baseCurrency);
    const amount = parseAmountToCents(String(formData.get("amount") ?? ""), currency);
    if (amount === null || amount <= 0) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { amount: "invalid" } };
    }

    // Senza modello scelto si applica quello predefinito: il caso comune e
    // "lo stipendio di sempre", e non deve richiedere una scelta.
    const templateId =
      parsed.templateId ?? (await defaultTemplate(context.household.id))?.id ?? null;

    created = await createIncome(
      context.household.id,
      {
        date: parsed.date,
        amount,
        currency,
        kind: parsed.kind,
        accountId: parsed.accountId,
        templateId,
        note: parsed.note ?? null,
      },
      context.user.id,
    );

    refresh(created);
    return ok({ id: created });
  });

  if (result.status === "success" && created) redirect(`/payday/${created}`);
  return result;
}

const lineSchema = z.object({
  id: z.string(),
  label: z.string().trim().max(80),
  kind: z.enum(["fixed", "percent", "remainder"]),
  envelopeId: nullableId,
  amount: z.string(),
  percent: z.string(),
  percentBasis: z.enum(["gross", "remaining"]),
  priority: z.coerce.number().int(),
});

/** Legge le righe dal form: ogni riga arriva come `line.<i>.<campo>`. */
function readLines(formData: FormData, currency: string): AllocationLineInput[] {
  const byIndex = new Map<string, Record<string, string>>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("line.") || typeof value !== "string") continue;
    const [, index, field] = key.split(".");
    if (!index || !field) continue;
    const row = byIndex.get(index) ?? {};
    row[field] = value;
    byIndex.set(index, row);
  }

  const lines: AllocationLineInput[] = [];
  for (const [index, row] of byIndex) {
    const parsed = lineSchema.safeParse({
      id: row.id ?? crypto.randomUUID(),
      label: row.label ?? "",
      kind: row.kind ?? "fixed",
      envelopeId: row.envelopeId ?? "",
      amount: row.amount ?? "0",
      percent: row.percent ?? "0",
      percentBasis: row.percentBasis ?? "gross",
      priority: row.priority ?? index,
    });
    if (!parsed.success) continue;

    const amountCents =
      parsed.data.kind === "fixed" ? (parseAmountToCents(parsed.data.amount, currency) ?? 0) : 0;
    const percentValue = Number(parsed.data.percent.replace(",", "."));
    const percentBps =
      parsed.data.kind === "percent" && Number.isFinite(percentValue)
        ? Math.round(percentValue * 100)
        : 0;

    lines.push({
      id: parsed.data.id,
      label: parsed.data.label,
      kind: parsed.data.kind,
      envelopeId: parsed.data.envelopeId,
      amountCents,
      percentBps,
      percentBasis: parsed.data.percentBasis,
      priority: parsed.data.priority,
    });
  }

  return lines;
}

export async function saveAllocationsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const incomeId = String(formData.get("incomeId") ?? "");
    if (!incomeId) return fail("errors.notFound");

    const payday = await getPayday(context.household.id, incomeId);
    if (!payday) return fail("errors.notFound");

    const amountText = String(formData.get("amount") ?? "").trim();
    if (amountText !== "") {
      const amount = parseAmountToCents(amountText, payday.currency);
      if (amount === null) {
        return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { amount: "invalid" } };
      }
      if (amount !== payday.amountCents) {
        await updateIncome(context.household.id, incomeId, { amount });
      }
    }

    await replaceAllocations(context.household.id, incomeId, readLines(formData, payday.currency));
    refresh(incomeId);
    return ok();
  });
}

export async function toggleAllocationAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const allocationId = String(formData.get("allocationId") ?? "");
  const done = String(formData.get("done") ?? "true") === "true";
  const incomeId = String(formData.get("incomeId") ?? "");

  const actualText = String(formData.get("actual") ?? "").trim();
  const currency = String(formData.get("currency") ?? "EUR");
  const actual = actualText === "" ? undefined : parseAmountToCents(actualText, currency);

  if (allocationId) {
    await setAllocationDone(context.household.id, allocationId, done, actual ?? undefined);
  }
  refresh(incomeId);
}

export async function markAllDoneAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const incomeId = String(formData.get("incomeId") ?? "");
  const done = String(formData.get("done") ?? "true") === "true";
  if (incomeId) await setAllAllocationsDone(context.household.id, incomeId, done);
  refresh(incomeId);
}

export async function closePaydayAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const incomeId = String(formData.get("incomeId") ?? "");
    if (!incomeId) return fail("errors.notFound");

    await closePayday(context.household.id, incomeId);
    // Lo storico del patrimonio si genera senza azioni manuali (F1.12).
    await saveNetWorthSnapshot(context.household.id, context.household.baseCurrency);

    refresh(incomeId);
    return ok({ messageKey: "payday.closed" });
  });
}

export async function reopenPaydayAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const incomeId = String(formData.get("incomeId") ?? "");
  if (incomeId) await reopenPayday(context.household.id, incomeId);
  refresh(incomeId);
}

export async function deleteIncomeAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const incomeId = String(formData.get("incomeId") ?? "");
  if (incomeId) await deleteIncome(context.household.id, incomeId);
  revalidatePath("/payday");
  revalidatePath("/");
  redirect("/payday");
}
