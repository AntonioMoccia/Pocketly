"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, isoDateSchema, nullableId, ok, runAction, type ActionState } from "@/lib/actions";
import { assertOwner, requireWritableContext } from "@/lib/session";
import { deleteGoal, saveGoal, setGoalStatus } from "@/server/goals";
import { addContribution, deleteContribution } from "@/server/investments";
import { deleteTemplate, duplicateTemplate, saveTemplate } from "@/server/templates";
import {
  createInvite,
  removeMember,
  revokeInvite,
  updateHousehold,
  updateMember,
} from "@/server/household";
import { saveNetWorthSnapshot } from "@/server/networth";
import { refreshRates } from "@/server/fx";
import { parseAmountToCents } from "@/lib/money";
import { today } from "@/lib/date";
import type { AllocationLineInput } from "@/lib/allocation";

// ---------------------------------------------------------------------------
// Obiettivi
// ---------------------------------------------------------------------------

export async function saveGoalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const goalId = String(formData.get("goalId") ?? "") || undefined;

    const parsed = z
      .object({
        name: z.string().trim().min(1).max(80),
        currency: z.string().trim().length(3),
        deadline: z.union([isoDateSchema, z.literal("")]).transform((v) => (v === "" ? null : v)),
        status: z.enum(["active", "reached", "paused", "archived"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse({
        name: formData.get("name"),
        currency: formData.get("currency") ?? context.household.baseCurrency,
        deadline: formData.get("deadline") ?? "",
        status: formData.get("status") ?? "active",
        note: formData.get("note") ?? "",
      });

    const target = parseAmountToCents(String(formData.get("target") ?? ""), parsed.currency);
    if (target === null || target < 0) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { target: "invalid" } };
    }

    const accountIds = formData.getAll("accountIds").map(String).filter(Boolean);

    const id = await saveGoal(
      context.household.id,
      { ...parsed, targetCents: target, note: parsed.note ?? null, accountIds },
      goalId,
    );

    revalidatePath("/goals");
    revalidatePath("/");
    return ok({ id });
  });
}

export async function deleteGoalAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const goalId = String(formData.get("goalId") ?? "");
  if (goalId) await deleteGoal(context.household.id, goalId);
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function setGoalStatusAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const goalId = String(formData.get("goalId") ?? "");
  const status = String(formData.get("status") ?? "active");
  const allowed = ["active", "reached", "paused", "archived"] as const;
  if (goalId && (allowed as readonly string[]).includes(status)) {
    await setGoalStatus(context.household.id, goalId, status as (typeof allowed)[number]);
  }
  revalidatePath("/goals");
}

// ---------------------------------------------------------------------------
// Versamenti
// ---------------------------------------------------------------------------

export async function addContributionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const accountId = String(formData.get("accountId") ?? "");
    const currency = String(formData.get("currency") ?? context.household.baseCurrency);
    const amount = parseAmountToCents(String(formData.get("amount") ?? ""), currency);
    if (!accountId || amount === null || amount <= 0) {
      return { status: "error", messageKey: "balances.invalidAmount", fieldErrors: { amount: "invalid" } };
    }

    await addContribution(context.household.id, {
      accountId,
      date: isoDateSchema.parse(formData.get("date") || today()),
      amountCents: amount,
      kind: String(formData.get("kind") ?? "deposit") === "withdrawal" ? "withdrawal" : "deposit",
      note: String(formData.get("note") ?? "").trim() || null,
    });

    revalidatePath("/goals");
    return ok();
  });
}

export async function deleteContributionAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const contributionId = String(formData.get("contributionId") ?? "");
  if (contributionId) await deleteContribution(context.household.id, contributionId);
  revalidatePath("/goals");
}

// ---------------------------------------------------------------------------
// Modelli di ripartizione
// ---------------------------------------------------------------------------

function readTemplateLines(formData: FormData, currency: string): AllocationLineInput[] {
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
  let position = 0;
  for (const [, row] of byIndex) {
    const kind = (row.kind ?? "fixed") as "fixed" | "percent" | "remainder";
    const label = (row.label ?? "").trim();
    const envelopeId = (row.envelopeId ?? "").trim() || null;
    if (label === "" && !envelopeId) continue;

    const percentValue = Number((row.percent ?? "0").replace(",", "."));
    lines.push({
      id: row.id || crypto.randomUUID(),
      label,
      kind,
      envelopeId,
      amountCents: kind === "fixed" ? (parseAmountToCents(row.amount ?? "0", currency) ?? 0) : 0,
      percentBps:
        kind === "percent" && Number.isFinite(percentValue) ? Math.round(percentValue * 100) : 0,
      percentBasis: (row.percentBasis ?? "gross") as "gross" | "remaining",
      priority: Number(row.priority ?? position),
    });
    position += 1;
  }
  return lines;
}

export async function saveTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    const templateId = String(formData.get("templateId") ?? "") || undefined;
    const name = String(formData.get("name") ?? "").trim();
    if (name === "") return fail("errors.validation");

    const id = await saveTemplate(
      context.household.id,
      {
        name,
        isDefault: String(formData.get("isDefault") ?? "") === "on",
        lines: readTemplateLines(formData, context.household.baseCurrency),
      },
      templateId,
    );

    revalidatePath("/templates");
    revalidatePath("/payday");
    return ok({ id });
  });
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const templateId = String(formData.get("templateId") ?? "");
  if (templateId) await deleteTemplate(context.household.id, templateId);
  revalidatePath("/templates");
  redirect("/templates");
}

export async function duplicateTemplateAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const templateId = String(formData.get("templateId") ?? "");
  const name = String(formData.get("name") ?? "Copia");
  if (templateId) await duplicateTemplate(context.household.id, templateId, name);
  revalidatePath("/templates");
}

// ---------------------------------------------------------------------------
// Household e istanza
// ---------------------------------------------------------------------------

export async function updateHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
    await updateHousehold(context.household.id, {
      name: String(formData.get("name") ?? ""),
      baseCurrency: String(formData.get("baseCurrency") ?? "EUR"),
      timezone: String(formData.get("timezone") ?? "Europe/Rome"),
    });
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return ok();
  });
}

export async function createInviteAction(
  _previous: ActionState & { token?: string },
  formData: FormData,
): Promise<ActionState & { token?: string }> {
  const context = await requireWritableContext();
  assertOwner(context);

  const role = String(formData.get("role") ?? "member");
  const allowed = ["owner", "member", "viewer"] as const;
  if (!(allowed as readonly string[]).includes(role)) return fail("errors.validation");

  const invite = await createInvite(context.household.id, {
    role: role as (typeof allowed)[number],
    email: String(formData.get("email") ?? "").trim() || null,
    invitedBy: context.user.id,
  });

  revalidatePath("/settings");
  // Il token si mostra una volta sola: nel database ne resta solo l'hash.
  return { ...ok(), token: invite.token };
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  assertOwner(context);
  const inviteId = String(formData.get("inviteId") ?? "");
  if (inviteId) await revokeInvite(context.household.id, inviteId);
  revalidatePath("/settings");
}

export async function updateMemberAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  assertOwner(context);
  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "");
  const shareText = String(formData.get("share") ?? "").trim();

  const allowed = ["owner", "member", "viewer"] as const;
  await updateMember(context.household.id, memberId, {
    ...((allowed as readonly string[]).includes(role)
      ? { role: role as (typeof allowed)[number] }
      : {}),
    ...(shareText !== ""
      ? { contributionShareBps: Math.round(Number(shareText.replace(",", ".")) * 100) }
      : {}),
  });
  revalidatePath("/settings");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  assertOwner(context);
  const memberId = String(formData.get("memberId") ?? "");
  if (memberId) await removeMember(context.household.id, memberId);
  revalidatePath("/settings");
}

export async function snapshotNowAction(): Promise<void> {
  const context = await requireWritableContext();
  await saveNetWorthSnapshot(context.household.id, context.household.baseCurrency);
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function refreshRatesAction(): Promise<void> {
  await requireWritableContext();
  await refreshRates();
  revalidatePath("/settings");
  revalidatePath("/");
}

