/**
 * Giorno di paga (F1.7) ed entrate irregolari (F1.8).
 *
 * Il wizard tiene lo stato nel database, non nel browser: un'entrata si puo
 * lasciare a meta e riprendere dal telefono. La regola che non si piega e
 * quella di chiusura: "da assegnare" a 0 e ogni riga spuntata.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@api/db";
import { allocations, incomeEvents } from "@api/db/schema";
import {
  canClosePayday,
  computeAllocation,
  type AllocationLineInput,
  type AllocationPlan,
} from "@pocketly/domain/allocation";
import { isValidCurrency } from "@pocketly/domain/money";
import { CannotCloseError, DomainError } from "@pocketly/domain/errors";
import { templateLines } from "./templates";

export type IncomeInput = {
  date: string;
  amount: number;
  currency: string;
  kind: "salary" | "invoice" | "other";
  /** Conto su cui arriva l'entrata. */
  accountId: string | null;
  templateId: string | null;
  note: string | null;
};

export type PaydayAllocation = {
  id: string;
  label: string;
  kind: "fixed" | "percent" | "remainder";
  envelopeId: string | null;
  plannedCents: number;
  actualCents: number | null;
  done: boolean;
  priority: number;
  percentBps: number;
  percentBasis: "gross" | "remaining";
};

export type Payday = {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  kind: "salary" | "invoice" | "other";
  /** Conto su cui e arrivata l'entrata. */
  accountId: string | null;
  templateId: string | null;
  note: string | null;
  closedAt: Date | null;
  createdAt: Date;
  allocations: PaydayAllocation[];
  plan: AllocationPlan;
  /** Somma degli importi effettivi dove indicati, altrimenti dei previsti. */
  movedCents: number;
  canClose: boolean;
};

/**
 * Registra un'entrata e, se c'e un modello, ne scrive subito la ripartizione.
 * Le righe diventano dati propri dell'entrata: cambiare il modello domani non
 * riscrive la storia di oggi.
 */
export async function createIncome(
  householdId: string,
  input: IncomeInput,
  userId: string,
): Promise<string> {
  const currency = input.currency.trim().toUpperCase();
  if (!isValidCurrency(currency)) throw new DomainError("invalidCurrency");
  if (!Number.isSafeInteger(input.amount)) throw new DomainError("validation");

  const lines = input.templateId ? await templateLines(input.templateId) : [];
  const plan = computeAllocation(input.amount, lines);

  return db.transaction(async (tx) => {
    const [income] = await tx
      .insert(incomeEvents)
      .values({
        householdId,
        date: input.date,
        amount: input.amount,
        currency,
        kind: input.kind,
        accountId: input.accountId,
        templateId: input.templateId,
        note: input.note?.trim() || null,
        createdBy: userId,
      })
      .returning({ id: incomeEvents.id });
    if (!income) throw new DomainError("validation");

    if (plan.lines.length > 0) {
      await tx.insert(allocations).values(
        plan.lines.map((line, index) => ({
          householdId,
          incomeEventId: income.id,
          label: line.label,
          kind: line.kind,
          envelopeId: line.envelopeId,
          planned: line.plannedCents,
          priority: line.priority === 0 ? index : line.priority,
          percentBps: line.percentBps,
          percentBasis: line.percentBasis,
        })),
      );
    }
    return income.id;
  });
}

export async function getPayday(householdId: string, incomeId: string): Promise<Payday | null> {
  const [income] = await db
    .select()
    .from(incomeEvents)
    .where(and(eq(incomeEvents.id, incomeId), eq(incomeEvents.householdId, householdId)))
    .limit(1);
  if (!income) return null;

  const rows = await db
    .select()
    .from(allocations)
    .where(eq(allocations.incomeEventId, incomeId))
    .orderBy(asc(allocations.priority), asc(allocations.label));

  const items: PaydayAllocation[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    kind: row.kind,
    envelopeId: row.envelopeId,
    plannedCents: row.planned,
    actualCents: row.actual,
    done: row.done,
    priority: row.priority,
    percentBps: row.percentBps,
    percentBasis: row.percentBasis,
  }));

  // Il piano si ricalcola dalle righe salvate: la riga "resto" resta coerente
  // anche se l'importo dell'entrata viene corretto dopo.
  const plan = computeAllocation(income.amount, items.map(toLineInput));
  const doneMap = Object.fromEntries(items.map((item) => [item.id, item.done]));

  return {
    id: income.id,
    date: income.date,
    amountCents: income.amount,
    currency: income.currency.trim(),
    kind: income.kind,
    accountId: income.accountId,
    templateId: income.templateId,
    note: income.note,
    closedAt: income.closedAt,
    createdAt: income.createdAt,
    allocations: items.map((item) => ({
      ...item,
      plannedCents: plan.lines.find((line) => line.id === item.id)?.plannedCents ?? item.plannedCents,
    })),
    plan,
    movedCents: items.reduce(
      (total, item) =>
        total +
        (item.actualCents ??
          plan.lines.find((line) => line.id === item.id)?.plannedCents ??
          item.plannedCents),
      0,
    ),
    canClose: canClosePayday(plan, doneMap),
  };
}

function toLineInput(item: PaydayAllocation): AllocationLineInput {
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    envelopeId: item.envelopeId,
    amountCents: item.plannedCents,
    percentBps: item.percentBps,
    percentBasis: item.percentBasis,
    priority: item.priority,
  };
}

/** Entrata aperta piu recente: la dashboard invita a riprenderla. */
export async function openPayday(householdId: string): Promise<Payday | null> {
  const [row] = await db
    .select({ id: incomeEvents.id })
    .from(incomeEvents)
    .where(and(eq(incomeEvents.householdId, householdId), isNull(incomeEvents.closedAt)))
    .orderBy(desc(incomeEvents.date), desc(incomeEvents.createdAt))
    .limit(1);
  return row ? getPayday(householdId, row.id) : null;
}

export async function lastClosedPayday(householdId: string): Promise<Payday | null> {
  const [row] = await db
    .select({ id: incomeEvents.id })
    .from(incomeEvents)
    .where(and(eq(incomeEvents.householdId, householdId), sql`${incomeEvents.closedAt} is not null`))
    .orderBy(desc(incomeEvents.date), desc(incomeEvents.createdAt))
    .limit(1);
  return row ? getPayday(householdId, row.id) : null;
}

export async function latestPayday(householdId: string): Promise<Payday | null> {
  return (await openPayday(householdId)) ?? (await lastClosedPayday(householdId));
}

export async function listIncomes(householdId: string, limit = 24) {
  const rows = await db
    .select({
      id: incomeEvents.id,
      date: incomeEvents.date,
      amount: incomeEvents.amount,
      currency: incomeEvents.currency,
      kind: incomeEvents.kind,
      closedAt: incomeEvents.closedAt,
      note: incomeEvents.note,
      allocated: sql<number>`coalesce(sum(${allocations.planned}), 0)`,
      lineCount: sql<number>`count(${allocations.id})`,
      doneCount: sql<number>`count(${allocations.id}) filter (where ${allocations.done})`,
    })
    .from(incomeEvents)
    .leftJoin(allocations, eq(allocations.incomeEventId, incomeEvents.id))
    .where(eq(incomeEvents.householdId, householdId))
    .groupBy(incomeEvents.id)
    .orderBy(desc(incomeEvents.date), desc(incomeEvents.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    currency: row.currency.trim(),
    allocated: Number(row.allocated),
    lineCount: Number(row.lineCount),
    doneCount: Number(row.doneCount),
  }));
}

export async function updateIncome(
  householdId: string,
  incomeId: string,
  input: Partial<Pick<IncomeInput, "amount" | "date" | "kind" | "accountId" | "note">>,
): Promise<void> {
  const result = await db
    .update(incomeEvents)
    .set({
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
    })
    .where(and(eq(incomeEvents.id, incomeId), eq(incomeEvents.householdId, householdId)))
    .returning({ id: incomeEvents.id });
  if (result.length === 0) throw new DomainError("notFound");
}

/** Sostituisce le righe di ripartizione di un'entrata aperta. */
export async function replaceAllocations(
  householdId: string,
  incomeId: string,
  lines: AllocationLineInput[],
): Promise<void> {
  const [income] = await db
    .select({ id: incomeEvents.id, amount: incomeEvents.amount, closedAt: incomeEvents.closedAt })
    .from(incomeEvents)
    .where(and(eq(incomeEvents.id, incomeId), eq(incomeEvents.householdId, householdId)))
    .limit(1);
  if (!income) throw new DomainError("notFound");
  if (income.closedAt) throw new DomainError("alreadyClosed");

  const plan = computeAllocation(income.amount, lines);

  await db.transaction(async (tx) => {
    // Le spunte gia date si conservano: si riconoscono dall'id della riga.
    const previous = await tx
      .select({ id: allocations.id, done: allocations.done, actual: allocations.actual })
      .from(allocations)
      .where(eq(allocations.incomeEventId, incomeId));
    const previousById = new Map(previous.map((row) => [row.id, row]));

    await tx.delete(allocations).where(eq(allocations.incomeEventId, incomeId));
    if (plan.lines.length === 0) return;

    await tx.insert(allocations).values(
      plan.lines.map((line, index) => {
        const before = previousById.get(line.id);
        return {
          householdId,
          incomeEventId: incomeId,
          label: line.label,
          kind: line.kind,
          envelopeId: line.envelopeId,
          planned: line.plannedCents,
          actual: before?.actual ?? null,
          done: before?.done ?? false,
          priority: line.priority === 0 ? index : line.priority,
          percentBps: line.percentBps,
          percentBasis: line.percentBasis,
        };
      }),
    );
  });
}

export async function setAllocationDone(
  householdId: string,
  allocationId: string,
  done: boolean,
  actualCents?: number | null,
): Promise<void> {
  const result = await db
    .update(allocations)
    .set({
      done,
      doneAt: done ? new Date() : null,
      ...(actualCents !== undefined ? { actual: actualCents } : {}),
    })
    .where(and(eq(allocations.id, allocationId), eq(allocations.householdId, householdId)))
    .returning({ id: allocations.id });
  if (result.length === 0) throw new DomainError("notFound");
}

export async function setAllAllocationsDone(
  householdId: string,
  incomeId: string,
  done: boolean,
): Promise<void> {
  await db
    .update(allocations)
    .set({ done, doneAt: done ? new Date() : null })
    .where(
      and(eq(allocations.incomeEventId, incomeId), eq(allocations.householdId, householdId)),
    );
}

export { CannotCloseError } from "@pocketly/domain/errors";

/**
 * Chiude il giorno di paga. Rifiuta se resta qualcosa da assegnare o se una
 * riga con importo non e spuntata: e il criterio di accettazione del wizard.
 */
export async function closePayday(householdId: string, incomeId: string): Promise<void> {
  const payday = await getPayday(householdId, incomeId);
  if (!payday) throw new DomainError("notFound");
  if (payday.closedAt) return;

  if (payday.plan.unassignedCents !== 0) {
    throw new CannotCloseError("unassigned", { unassignedCents: payday.plan.unassignedCents });
  }
  const pending = payday.allocations.filter((line) => line.plannedCents !== 0 && !line.done).length;
  if (pending > 0) {
    throw new CannotCloseError("not_done", { pendingLines: pending });
  }

  await db
    .update(incomeEvents)
    .set({ closedAt: new Date() })
    .where(and(eq(incomeEvents.id, incomeId), eq(incomeEvents.householdId, householdId)));
}

export async function reopenPayday(householdId: string, incomeId: string): Promise<void> {
  await db
    .update(incomeEvents)
    .set({ closedAt: null })
    .where(and(eq(incomeEvents.id, incomeId), eq(incomeEvents.householdId, householdId)));
}

export async function deleteIncome(householdId: string, incomeId: string): Promise<void> {
  const result = await db
    .delete(incomeEvents)
    .where(and(eq(incomeEvents.id, incomeId), eq(incomeEvents.householdId, householdId)))
    .returning({ id: incomeEvents.id });
  if (result.length === 0) throw new DomainError("notFound");
}
