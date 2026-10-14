/**
 * Obiettivi (F1.9).
 *
 * L'avanzamento non e un contatore: e la somma dei saldi dei conti collegati,
 * ricalcolata a ogni lettura. Cosi non puo divergere dalla realta.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@api/db";
import { goalAccounts, goals } from "@api/db/schema";
import { computeGoalProgress, type GoalProgress } from "@pocketly/domain/goals";
import { ownBalanceInBase } from "@pocketly/domain/networth";
import { isValidCurrency } from "@pocketly/domain/money";
import { parseIsoDate, today } from "@pocketly/domain/date";
import { DomainError, listAccounts } from "./accounts";
import { ratesForDate } from "./fx";

export type GoalWithProgress = {
  id: string;
  name: string;
  targetCents: number;
  currency: string;
  deadline: string | null;
  status: "active" | "reached" | "paused" | "archived";
  note: string | null;
  accountIds: string[];
  accountNames: string[];
  progress: GoalProgress;
};

export async function listGoals(
  householdId: string,
  baseCurrency: string,
  options: { includeArchived?: boolean } = {},
): Promise<GoalWithProgress[]> {
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.householdId, householdId))
    .orderBy(asc(goals.deadline), asc(goals.name));

  const visible = options.includeArchived ? rows : rows.filter((row) => row.status !== "archived");
  if (visible.length === 0) return [];

  const links = await db
    .select({ goalId: goalAccounts.goalId, accountId: goalAccounts.accountId })
    .from(goalAccounts)
    .where(
      inArray(
        goalAccounts.goalId,
        visible.map((row) => row.id),
      ),
    );

  const asOf = today();
  const [accounts, rates] = await Promise.all([
    listAccounts(householdId, { asOf }),
    ratesForDate(asOf),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const now = parseIsoDate(asOf);

  return visible.map((goal) => {
    const accountIds = links.filter((l) => l.goalId === goal.id).map((l) => l.accountId);
    const linked = accountIds.map((id) => accountById.get(id)).filter((a) => a !== undefined);
    // L'obiettivo ha una sua valuta: i saldi collegati vi si convertono.
    const currentCents = linked.reduce(
      (total, account) => total + (ownBalanceInBase(account, goal.currency.trim(), rates) ?? 0),
      0,
    );
    return {
      id: goal.id,
      name: goal.name,
      targetCents: goal.target,
      currency: goal.currency.trim(),
      deadline: goal.deadline,
      status: goal.status,
      note: goal.note,
      accountIds,
      // "Principale" da solo non dice di quale conto: si aggiunge il conto.
      accountNames: linked.map((account) => {
        const parent = account.parentId ? accountById.get(account.parentId) : undefined;
        return parent ? `${parent.name} · ${account.name}` : account.name;
      }),
      progress: computeGoalProgress(
        goal.target,
        currentCents,
        goal.deadline ? parseIsoDate(goal.deadline) : null,
        now,
      ),
    };
  });
}

export async function getGoal(
  householdId: string,
  goalId: string,
  baseCurrency: string,
): Promise<GoalWithProgress | null> {
  const all = await listGoals(householdId, baseCurrency, { includeArchived: true });
  return all.find((goal) => goal.id === goalId) ?? null;
}

export type GoalInput = {
  name: string;
  targetCents: number;
  currency: string;
  deadline: string | null;
  status: "active" | "reached" | "paused" | "archived";
  note: string | null;
  accountIds: string[];
};

export async function saveGoal(
  householdId: string,
  input: GoalInput,
  goalId?: string,
): Promise<string> {
  const currency = input.currency.trim().toUpperCase();
  if (!isValidCurrency(currency)) throw new DomainError("invalidCurrency");
  if (!Number.isSafeInteger(input.targetCents) || input.targetCents < 0) {
    throw new DomainError("validation");
  }

  // Si collegano solo conti dell'household: un id estraneo viene scartato.
  const accounts = await listAccounts(householdId, { includeArchived: true });
  const allowed = new Set(accounts.map((account) => account.id));
  const accountIds = input.accountIds.filter((id) => allowed.has(id));

  return db.transaction(async (tx) => {
    let id = goalId;
    if (id) {
      const updated = await tx
        .update(goals)
        .set({
          name: input.name.trim(),
          target: input.targetCents,
          currency,
          deadline: input.deadline,
          status: input.status,
          note: input.note?.trim() || null,
        })
        .where(and(eq(goals.id, id), eq(goals.householdId, householdId)))
        .returning({ id: goals.id });
      if (updated.length === 0) throw new DomainError("notFound");
      await tx.delete(goalAccounts).where(eq(goalAccounts.goalId, id));
    } else {
      const [created] = await tx
        .insert(goals)
        .values({
          householdId,
          name: input.name.trim(),
          target: input.targetCents,
          currency,
          deadline: input.deadline,
          status: input.status,
          note: input.note?.trim() || null,
        })
        .returning({ id: goals.id });
      if (!created) throw new DomainError("validation");
      id = created.id;
    }

    if (accountIds.length > 0) {
      await tx
        .insert(goalAccounts)
        .values(accountIds.map((accountId) => ({ goalId: id!, accountId })));
    }
    return id!;
  });
}

export async function deleteGoal(householdId: string, goalId: string): Promise<void> {
  const result = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.householdId, householdId)))
    .returning({ id: goals.id });
  if (result.length === 0) throw new DomainError("notFound");
}

export async function setGoalStatus(
  householdId: string,
  goalId: string,
  status: GoalInput["status"],
): Promise<void> {
  await db
    .update(goals)
    .set({ status })
    .where(and(eq(goals.id, goalId), eq(goals.householdId, householdId)));
}
