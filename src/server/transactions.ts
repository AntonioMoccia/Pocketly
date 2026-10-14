/**
 * Movimenti: lettura con filtri, categorizzazione, abbinamento dei giroconti.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  categories,
  envelopes,
  rules as rulesTable,
  transactions,
  transferTodos,
} from "@/db/schema";
import { applyRules, matchTransfers, suggestRule, type Rule } from "@/lib/rules";
import { addMonths, endOfMonth, startOfMonth, today } from "@/lib/date";
import { DomainError } from "./accounts";

export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  counterparty: string | null;
  amount: number;
  currency: string;
  kind: "expense" | "income" | "transfer";
  ignored: boolean;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  envelopeId: string | null;
  envelopeName: string | null;
  envelopeColor: number | null;
  envelopeAccountId: string | null;
  transferGroupId: string | null;
  note: string | null;
};

export type TransactionFilter = {
  month?: string;
  accountId?: string;
  envelopeId?: string;
  categoryId?: string;
  /** Solo i movimenti ancora senza categoria. */
  uncategorized?: boolean;
  kind?: "expense" | "income" | "transfer";
  limit?: number;
};

export async function listTransactions(
  householdId: string,
  filter: TransactionFilter = {},
): Promise<TransactionRow[]> {
  const conditions = [eq(transactions.householdId, householdId)];

  if (filter.month) {
    const start = startOfMonth(filter.month);
    conditions.push(gte(transactions.bookedDate, start));
    conditions.push(lte(transactions.bookedDate, endOfMonth(start)));
  }
  if (filter.accountId) conditions.push(eq(transactions.accountId, filter.accountId));
  if (filter.envelopeId) conditions.push(eq(transactions.envelopeId, filter.envelopeId));
  if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
  if (filter.uncategorized) conditions.push(isNull(transactions.categoryId));
  if (filter.kind) conditions.push(eq(transactions.kind, filter.kind));

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.bookedDate,
      description: transactions.description,
      counterparty: transactions.counterparty,
      amount: transactions.amount,
      currency: transactions.currency,
      kind: transactions.kind,
      ignored: transactions.ignored,
      accountId: transactions.accountId,
      accountName: accounts.name,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      envelopeId: transactions.envelopeId,
      envelopeName: envelopes.name,
      envelopeColor: envelopes.color,
      envelopeAccountId: envelopes.accountId,
      transferGroupId: transactions.transferGroupId,
      note: transactions.note,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(envelopes, eq(envelopes.id, transactions.envelopeId))
    .where(and(...conditions))
    .orderBy(desc(transactions.bookedDate), desc(transactions.createdAt))
    .limit(filter.limit ?? 200);

  return rows.map((row) => ({ ...row, currency: row.currency.trim() }));
}

export async function getTransaction(
  householdId: string,
  transactionId: string,
): Promise<TransactionRow | null> {
  const rows = await listTransactions(householdId, { limit: 1000 });
  return rows.find((row) => row.id === transactionId) ?? null;
}

/** Movimenti ancora da categorizzare, i piu recenti prima. */
export async function uncategorizedCount(householdId: string, month?: string): Promise<number> {
  const conditions = [
    eq(transactions.householdId, householdId),
    isNull(transactions.categoryId),
    eq(transactions.ignored, false),
    sql`${transactions.kind} <> 'transfer'`,
  ];
  if (month) {
    const start = startOfMonth(month);
    conditions.push(gte(transactions.bookedDate, start));
    conditions.push(lte(transactions.bookedDate, endOfMonth(start)));
  }
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(transactions)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}

/**
 * Assegna categoria e busta a un movimento. La busta predefinita della
 * categoria si applica solo se non e stata scelta esplicitamente: categoria e
 * busta restano due assi indipendenti.
 */
export async function categorizeTransaction(
  householdId: string,
  transactionId: string,
  input: { categoryId: string | null; envelopeId?: string | null },
): Promise<void> {
  let envelopeId = input.envelopeId;

  if (envelopeId === undefined && input.categoryId) {
    const [category] = await db
      .select({ defaultEnvelopeId: categories.defaultEnvelopeId })
      .from(categories)
      .where(and(eq(categories.id, input.categoryId), eq(categories.householdId, householdId)))
      .limit(1);
    envelopeId = category?.defaultEnvelopeId ?? null;
  }

  const result = await db
    .update(transactions)
    .set({
      categoryId: input.categoryId,
      ...(envelopeId !== undefined ? { envelopeId } : {}),
    })
    .where(and(eq(transactions.id, transactionId), eq(transactions.householdId, householdId)))
    .returning({ id: transactions.id });
  if (result.length === 0) throw new DomainError("notFound");
}

export async function setTransactionIgnored(
  householdId: string,
  transactionId: string,
  ignored: boolean,
): Promise<void> {
  await db
    .update(transactions)
    .set({ ignored })
    .where(and(eq(transactions.id, transactionId), eq(transactions.householdId, householdId)));
}

// ---------------------------------------------------------------------------
// Regole
// ---------------------------------------------------------------------------

export async function listRules(householdId: string): Promise<Rule[]> {
  const rows = await db
    .select()
    .from(rulesTable)
    .where(eq(rulesTable.householdId, householdId))
    .orderBy(asc(rulesTable.priority), asc(rulesTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    operator: row.operator,
    value: row.value,
    categoryId: row.categoryId,
    envelopeId: row.envelopeId,
    priority: row.priority,
    enabled: row.enabled,
  }));
}

export async function createRule(
  householdId: string,
  input: Omit<Rule, "id" | "priority" | "enabled"> & { priority?: number },
): Promise<string> {
  const [created] = await db
    .insert(rulesTable)
    .values({
      householdId,
      field: input.field,
      operator: input.operator,
      value: input.value.trim(),
      categoryId: input.categoryId,
      envelopeId: input.envelopeId,
      priority: input.priority ?? 100,
    })
    .returning({ id: rulesTable.id });
  if (!created) throw new DomainError("validation");
  return created.id;
}

export async function deleteRule(householdId: string, ruleId: string): Promise<void> {
  await db
    .delete(rulesTable)
    .where(and(eq(rulesTable.id, ruleId), eq(rulesTable.householdId, householdId)));
}

export async function setRuleEnabled(
  householdId: string,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(rulesTable)
    .set({ enabled })
    .where(and(eq(rulesTable.id, ruleId), eq(rulesTable.householdId, householdId)));
}

/** Regola proposta da una correzione manuale, e quanti movimenti toccherebbe. */
export async function ruleSuggestionFor(
  householdId: string,
  transactionId: string,
  categoryId: string,
  envelopeId: string | null,
): Promise<{ rule: Omit<Rule, "id" | "priority" | "enabled">; wouldMatch: number } | null> {
  const transaction = await getTransaction(householdId, transactionId);
  if (!transaction) return null;

  const suggestion = suggestRule(
    {
      description: transaction.description,
      counterparty: transaction.counterparty,
      amountCents: transaction.amount,
    },
    categoryId,
    envelopeId,
  );
  if (!suggestion) return null;

  const pending = await listTransactions(householdId, { uncategorized: true, limit: 500 });
  const wouldMatch = pending.filter(
    (row) =>
      row.id !== transactionId &&
      applyRules([{ ...suggestion, id: "preview", priority: 0, enabled: true }], {
        description: row.description,
        counterparty: row.counterparty,
        amountCents: row.amount,
      }).categoryId !== null,
  ).length;

  return { rule: suggestion, wouldMatch };
}

/**
 * Applica le regole ai movimenti ancora senza categoria. Si lancia dopo un
 * import e dopo la creazione di una regola, per far valere la regola nuova
 * anche sul passato non ancora sistemato.
 */
export async function applyRulesToPending(
  householdId: string,
  options: { onlyRuleId?: string } = {},
): Promise<number> {
  const allRules = await listRules(householdId);
  const active = options.onlyRuleId
    ? allRules.filter((rule) => rule.id === options.onlyRuleId)
    : allRules;
  if (active.length === 0) return 0;

  const pending = await listTransactions(householdId, { uncategorized: true, limit: 1000 });
  let changed = 0;

  for (const row of pending) {
    const outcome = applyRules(active, {
      description: row.description,
      counterparty: row.counterparty,
      amountCents: row.amount,
    });
    if (!outcome.categoryId) continue;

    await categorizeTransaction(householdId, row.id, {
      categoryId: outcome.categoryId,
      ...(outcome.envelopeId ? { envelopeId: outcome.envelopeId } : {}),
    });
    changed += 1;

    if (outcome.ruleId) {
      await db
        .update(rulesTable)
        .set({ hitCount: sql`${rulesTable.hitCount} + 1` })
        .where(eq(rulesTable.id, outcome.ruleId));
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Giroconti
// ---------------------------------------------------------------------------

/**
 * Cerca le coppie di giroconto tra i movimenti recenti e le marca: escluse da
 * spese ed entrate, cosi spostare soldi tra i propri conti non sembra una
 * spesa (criterio di accettazione F2.7).
 */
export async function detectTransfers(
  householdId: string,
  options: { since?: string } = {},
): Promise<number> {
  const since = options.since ?? addMonths(today(), -2);
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      bookedDate: transactions.bookedDate,
      amountCents: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        gte(transactions.bookedDate, since),
        isNull(transactions.transferGroupId),
        eq(transactions.ignored, false),
      ),
    );

  const pairs = matchTransfers(rows);
  for (const pair of pairs) {
    const groupId = crypto.randomUUID();
    await db
      .update(transactions)
      .set({ transferGroupId: groupId, kind: "transfer", envelopeId: null, categoryId: null })
      .where(inArray(transactions.id, [pair.outId, pair.inId]));
  }

  if (pairs.length > 0) await settleTransferTodos(householdId);
  return pairs.length;
}

/**
 * Spunta i giroconti da fare quando il movimento corrispondente compare tra i
 * movimenti importati: la lista si svuota da sola.
 */
export async function settleTransferTodos(householdId: string): Promise<number> {
  const todos = await db
    .select()
    .from(transferTodos)
    .where(and(eq(transferTodos.householdId, householdId), eq(transferTodos.status, "todo")));
  if (todos.length === 0) return 0;

  const candidates = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amount: transactions.amount,
      date: transactions.bookedDate,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.kind, "transfer"),
        gte(transactions.bookedDate, addMonths(today(), -2)),
      ),
    );

  const used = new Set<string>();
  let settled = 0;

  for (const todo of todos) {
    const match = candidates.find(
      (row) =>
        !used.has(row.id) &&
        row.accountId === todo.toAccountId &&
        row.amount === todo.amount &&
        row.amount > 0,
    );
    if (!match) continue;
    used.add(match.id);
    await db
      .update(transferTodos)
      .set({ status: "done", doneAt: new Date(), transactionId: match.id })
      .where(eq(transferTodos.id, todo.id));
    settled += 1;
  }

  return settled;
}

export async function listTransferTodos(householdId: string, status: "todo" | "done" = "todo") {
  const fromAccount = sql<string>`from_account.name`;
  return db
    .select({
      id: transferTodos.id,
      amount: transferTodos.amount,
      currency: transferTodos.currency,
      reason: transferTodos.reason,
      status: transferTodos.status,
      note: transferTodos.note,
      createdAt: transferTodos.createdAt,
      fromAccountId: transferTodos.fromAccountId,
      toAccountId: transferTodos.toAccountId,
      fromAccountName: sql<string>`coalesce(${fromAccount}, '')`,
      toAccountName: sql<string>`coalesce(to_account.name, '')`,
    })
    .from(transferTodos)
    .leftJoin(sql`accounts as from_account`, sql`from_account.id = ${transferTodos.fromAccountId}`)
    .leftJoin(sql`accounts as to_account`, sql`to_account.id = ${transferTodos.toAccountId}`)
    .where(and(eq(transferTodos.householdId, householdId), eq(transferTodos.status, status)))
    .orderBy(desc(transferTodos.createdAt));
}

export async function setTransferTodoDone(
  householdId: string,
  todoId: string,
  done: boolean,
): Promise<void> {
  await db
    .update(transferTodos)
    .set({ status: done ? "done" : "todo", doneAt: done ? new Date() : null })
    .where(and(eq(transferTodos.id, todoId), eq(transferTodos.householdId, householdId)));
}

/** Percentuale di movimenti categorizzati in un mese: la misura della fase 1.5. */
export async function categorizationRate(
  householdId: string,
  month: string,
): Promise<{ total: number; categorized: number; ratio: number }> {
  const start = startOfMonth(month);
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      categorized: sql<number>`count(*) filter (where ${transactions.categoryId} is not null)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        gte(transactions.bookedDate, start),
        lte(transactions.bookedDate, endOfMonth(start)),
        eq(transactions.ignored, false),
        sql`${transactions.kind} <> 'transfer'`,
      ),
    );

  const total = Number(row?.total ?? 0);
  const categorized = Number(row?.categorized ?? 0);
  return { total, categorized, ratio: total > 0 ? categorized / total : 0 };
}
