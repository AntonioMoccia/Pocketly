/**
 * Buste: letture del mese, spostamenti e chiusura.
 *
 * Il riporto non si salva da nessuna parte: e la somma di tutto quello che e
 * successo alla busta prima dell'inizio del mese. La chiusura del mese scrive
 * uno spostamento vero per le buste con politica "svuota", quindi il conto
 * torna da solo anche guardando indietro di un anno.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  allocations,
  envelopeMoves,
  envelopes,
  incomeEvents,
  monthCloses,
  transactions,
  transferTodos,
} from "@/db/schema";
import {
  computeEnvelopeState,
  coverageOptions,
  monthKey,
  planSweeps,
  type EnvelopeState,
} from "@/lib/envelopes";
import { addMonths, endOfMonth, startOfMonth, today } from "@/lib/date";
import { DomainError } from "./accounts";
import { latestBalances } from "./accounts";

export type EnvelopeRow = EnvelopeState & {
  accountName: string;
  /** Il conto su cui vive la busta, per i giroconti. */
  accountCurrency: string;
};

type Totals = { assigned: number; spent: number; movedIn: number; movedOut: number };

function emptyTotals(): Totals {
  return { assigned: 0, spent: 0, movedIn: 0, movedOut: 0 };
}

/**
 * Somme per busta in un intervallo di date. `from` escluso significa "da
 * sempre", cosi la stessa funzione serve al mese corrente e al riporto.
 */
async function totalsByEnvelope(
  householdId: string,
  range: { from?: string; to: string },
): Promise<Map<string, Totals>> {
  const out = new Map<string, Totals>();
  const get = (id: string) => {
    const existing = out.get(id);
    if (existing) return existing;
    const fresh = emptyTotals();
    out.set(id, fresh);
    return fresh;
  };

  const fromClause = range.from
    ? sql`and ${incomeEvents.date} >= ${range.from}`
    : sql``;

  // Assegnato: le righe di ripartizione delle entrate nel periodo.
  const assigned = await db
    .select({
      envelopeId: allocations.envelopeId,
      total: sql<number>`coalesce(sum(coalesce(${allocations.actual}, ${allocations.planned})), 0)`,
    })
    .from(allocations)
    .innerJoin(incomeEvents, eq(incomeEvents.id, allocations.incomeEventId))
    .where(
      sql`${allocations.householdId} = ${householdId} and ${incomeEvents.date} <= ${range.to} ${fromClause}`,
    )
    .groupBy(allocations.envelopeId);

  for (const row of assigned) {
    if (!row.envelopeId) continue;
    get(row.envelopeId).assigned += Number(row.total);
  }

  // Speso: i movimenti in uscita attribuiti alla busta. I giroconti e le righe
  // ignorate restano fuori: spostare soldi tra i propri conti non e una spesa.
  const spentFrom = range.from ? sql`and ${transactions.bookedDate} >= ${range.from}` : sql``;
  const spent = await db
    .select({
      envelopeId: transactions.envelopeId,
      total: sql<number>`coalesce(sum(-${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      sql`${transactions.householdId} = ${householdId}
        and ${transactions.bookedDate} <= ${range.to} ${spentFrom}
        and ${transactions.ignored} = false
        and ${transactions.kind} <> 'transfer'
        and ${transactions.amount} < 0`,
    )
    .groupBy(transactions.envelopeId);

  for (const row of spent) {
    if (!row.envelopeId) continue;
    get(row.envelopeId).spent += Number(row.total);
  }

  // Rimborsi e resi: un'entrata attribuita a una busta rimette dentro i soldi.
  const refunds = await db
    .select({
      envelopeId: transactions.envelopeId,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      sql`${transactions.householdId} = ${householdId}
        and ${transactions.bookedDate} <= ${range.to} ${spentFrom}
        and ${transactions.ignored} = false
        and ${transactions.kind} <> 'transfer'
        and ${transactions.amount} > 0`,
    )
    .groupBy(transactions.envelopeId);

  for (const row of refunds) {
    if (!row.envelopeId) continue;
    get(row.envelopeId).spent -= Number(row.total);
  }

  const movesFrom = range.from ? sql`and ${envelopeMoves.date} >= ${range.from}` : sql``;
  const moves = await db
    .select({
      fromEnvelopeId: envelopeMoves.fromEnvelopeId,
      toEnvelopeId: envelopeMoves.toEnvelopeId,
      amount: envelopeMoves.amount,
    })
    .from(envelopeMoves)
    .where(
      sql`${envelopeMoves.householdId} = ${householdId} and ${envelopeMoves.date} <= ${range.to} ${movesFrom}`,
    );

  for (const row of moves) {
    if (row.fromEnvelopeId) get(row.fromEnvelopeId).movedOut += Number(row.amount);
    if (row.toEnvelopeId) get(row.toEnvelopeId).movedIn += Number(row.amount);
  }

  return out;
}

/** Buste di un household con i numeri del mese richiesto. */
export async function listEnvelopes(
  householdId: string,
  options: { month?: string; includeArchived?: boolean } = {},
): Promise<EnvelopeRow[]> {
  const month = startOfMonth(options.month ?? today());
  const monthEnd = endOfMonth(month);
  const previousEnd = addMonths(month, -1);

  const rows = await db
    .select({
      id: envelopes.id,
      name: envelopes.name,
      kind: envelopes.kind,
      accountId: envelopes.accountId,
      leftoverPolicy: envelopes.leftoverPolicy,
      sweepToEnvelopeId: envelopes.sweepToEnvelopeId,
      color: envelopes.color,
      archived: envelopes.archived,
      sortOrder: envelopes.sortOrder,
      accountName: accounts.name,
      accountCurrency: accounts.currency,
    })
    .from(envelopes)
    .innerJoin(accounts, eq(accounts.id, envelopes.accountId))
    .where(
      options.includeArchived
        ? eq(envelopes.householdId, householdId)
        : and(eq(envelopes.householdId, householdId), eq(envelopes.archived, false)),
    )
    .orderBy(asc(envelopes.sortOrder), asc(envelopes.name));

  if (rows.length === 0) return [];

  const [monthTotals, carryTotals, balances] = await Promise.all([
    totalsByEnvelope(householdId, { from: month, to: monthEnd }),
    // Tutto cio che e successo prima dell'inizio del mese.
    totalsByEnvelope(householdId, { to: endOfMonth(previousEnd) }),
    latestBalances(householdId, monthEnd),
  ]);

  return rows.map((row) => {
    const current = monthTotals.get(row.id) ?? emptyTotals();
    const before = carryTotals.get(row.id) ?? emptyTotals();
    const carryOverCents =
      row.leftoverPolicy === "sweep"
        ? 0
        : before.assigned + before.movedIn - before.movedOut - before.spent;

    const state = computeEnvelopeState(
      {
        id: row.id,
        name: row.name,
        kind: row.kind,
        accountId: row.accountId,
        leftoverPolicy: row.leftoverPolicy,
        sweepToEnvelopeId: row.sweepToEnvelopeId,
        color: row.color,
        archived: row.archived,
      },
      {
        carryOverCents,
        assignedCents: current.assigned,
        movedInCents: current.movedIn,
        movedOutCents: current.movedOut,
        spentCents: current.spent,
        realBalanceCents:
          row.kind === "real" ? (balances.get(row.accountId)?.amount ?? 0) : undefined,
      },
    );

    return {
      ...state,
      accountName: row.accountName,
      accountCurrency: row.accountCurrency.trim(),
    };
  });
}

export async function getEnvelope(
  householdId: string,
  envelopeId: string,
  month?: string,
): Promise<EnvelopeRow | null> {
  const all = await listEnvelopes(householdId, { month, includeArchived: true });
  return all.find((envelope) => envelope.id === envelopeId) ?? null;
}

export type EnvelopeInputData = {
  name: string;
  kind: "real" | "virtual";
  accountId: string;
  leftoverPolicy: "accumulate" | "sweep";
  sweepToEnvelopeId: string | null;
  color: number;
};

export async function saveEnvelope(
  householdId: string,
  input: EnvelopeInputData,
  envelopeId?: string,
): Promise<string> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.householdId, householdId)))
    .limit(1);
  if (!account) throw new DomainError("accountNotFound");
  if (input.leftoverPolicy === "sweep" && input.sweepToEnvelopeId === envelopeId) {
    throw new DomainError("validation");
  }

  if (envelopeId) {
    const updated = await db
      .update(envelopes)
      .set({
        name: input.name.trim(),
        kind: input.kind,
        accountId: input.accountId,
        leftoverPolicy: input.leftoverPolicy,
        sweepToEnvelopeId: input.leftoverPolicy === "sweep" ? input.sweepToEnvelopeId : null,
        color: input.color,
      })
      .where(and(eq(envelopes.id, envelopeId), eq(envelopes.householdId, householdId)))
      .returning({ id: envelopes.id });
    if (updated.length === 0) throw new DomainError("notFound");
    return envelopeId;
  }

  const [created] = await db
    .insert(envelopes)
    .values({
      householdId,
      name: input.name.trim(),
      kind: input.kind,
      accountId: input.accountId,
      leftoverPolicy: input.leftoverPolicy,
      sweepToEnvelopeId: input.leftoverPolicy === "sweep" ? input.sweepToEnvelopeId : null,
      color: input.color,
    })
    .returning({ id: envelopes.id });
  if (!created) throw new DomainError("validation");
  return created.id;
}

export async function setEnvelopeArchived(
  householdId: string,
  envelopeId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(envelopes)
    .set({ archived })
    .where(and(eq(envelopes.id, envelopeId), eq(envelopes.householdId, householdId)));
}

export async function deleteEnvelope(householdId: string, envelopeId: string): Promise<void> {
  const result = await db
    .delete(envelopes)
    .where(and(eq(envelopes.id, envelopeId), eq(envelopes.householdId, householdId)))
    .returning({ id: envelopes.id });
  if (result.length === 0) throw new DomainError("notFound");
}

/**
 * Crea la busta reale che accompagna un conto o un Pocket, se non c'e gia.
 * Cosi "Pocket" e "busta" restano la stessa cosa per chi usa l'app e non
 * bisogna imparare un concetto nuovo per usare il giorno di paga.
 */
export async function ensureEnvelopeForAccount(
  householdId: string,
  accountId: string,
  name: string,
  color: number,
): Promise<string> {
  const [existing] = await db
    .select({ id: envelopes.id })
    .from(envelopes)
    .where(
      and(
        eq(envelopes.householdId, householdId),
        eq(envelopes.accountId, accountId),
        eq(envelopes.kind, "real"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(envelopes)
    .values({ householdId, accountId, name: name.trim(), kind: "real", color })
    .returning({ id: envelopes.id });
  if (!created) throw new DomainError("validation");
  return created.id;
}

// ---------------------------------------------------------------------------
// Spostamenti e coperture
// ---------------------------------------------------------------------------

/**
 * Sposta assegnato da una busta all'altra. Se le due buste stanno su conti
 * diversi aggiunge il giroconto da fare: le buste virtuali si spostano con un
 * clic, i soldi reali no.
 */
export async function moveBetweenEnvelopes(
  householdId: string,
  input: {
    fromEnvelopeId: string;
    toEnvelopeId: string;
    amountCents: number;
    reason: "overspend" | "leftover" | "manual";
    date?: string;
    note?: string | null;
  },
): Promise<{ moveId: string; transferTodoId: string | null }> {
  if (input.amountCents <= 0) throw new DomainError("validation");
  if (input.fromEnvelopeId === input.toEnvelopeId) throw new DomainError("validation");

  const rows = await db
    .select({
      id: envelopes.id,
      accountId: envelopes.accountId,
      currency: accounts.currency,
      name: envelopes.name,
    })
    .from(envelopes)
    .innerJoin(accounts, eq(accounts.id, envelopes.accountId))
    .where(eq(envelopes.householdId, householdId));

  const from = rows.find((row) => row.id === input.fromEnvelopeId);
  const to = rows.find((row) => row.id === input.toEnvelopeId);
  if (!from || !to) throw new DomainError("notFound");

  const date = input.date ?? today();

  return db.transaction(async (tx) => {
    let transferTodoId: string | null = null;

    if (from.accountId !== to.accountId) {
      const [todo] = await tx
        .insert(transferTodos)
        .values({
          householdId,
          fromAccountId: from.accountId,
          toAccountId: to.accountId,
          amount: input.amountCents,
          currency: from.currency.trim(),
          reason: input.reason === "leftover" ? "leftover" : "overspend",
          note: `${from.name} -> ${to.name}`,
        })
        .returning({ id: transferTodos.id });
      transferTodoId = todo?.id ?? null;
    }

    const [move] = await tx
      .insert(envelopeMoves)
      .values({
        householdId,
        fromEnvelopeId: input.fromEnvelopeId,
        toEnvelopeId: input.toEnvelopeId,
        amount: input.amountCents,
        currency: from.currency.trim(),
        date,
        reason: input.reason,
        transferTodoId,
        note: input.note ?? null,
      })
      .returning({ id: envelopeMoves.id });

    if (!move) throw new DomainError("validation");
    return { moveId: move.id, transferTodoId };
  });
}

/** Buste da cui coprire uno sforamento, ordinate per comodita. */
export async function coverageFor(
  householdId: string,
  envelopeId: string,
  month?: string,
) {
  const all = await listEnvelopes(householdId, { month });
  const target = all.find((envelope) => envelope.id === envelopeId);
  if (!target) throw new DomainError("notFound");

  // Il fondo emergenza e un cuscinetto: resta disponibile ma scende in fondo.
  const discouragedIds = all
    .filter((envelope) => /emergenz|emergency/i.test(envelope.name))
    .map((envelope) => envelope.id);

  return {
    target,
    options: coverageOptions(target, all, { discouragedIds }),
  };
}

// ---------------------------------------------------------------------------
// Chiusura del mese
// ---------------------------------------------------------------------------

export type MonthCloseResult = {
  month: string;
  sweeps: number;
  transferTodos: number;
  alreadyClosed: boolean;
};

/**
 * Applica le politiche avanzi di un mese. Si puo eseguire una volta sola: la
 * riga in `month_closes` evita che un secondo clic sposti di nuovo gli avanzi.
 */
export async function closeMonth(
  householdId: string,
  month: string,
  userId: string,
): Promise<MonthCloseResult> {
  const key = monthKey(month);

  const [existing] = await db
    .select({ id: monthCloses.id })
    .from(monthCloses)
    .where(and(eq(monthCloses.householdId, householdId), eq(monthCloses.month, key)))
    .limit(1);
  if (existing) {
    return { month: key, sweeps: 0, transferTodos: 0, alreadyClosed: true };
  }

  const states = await listEnvelopes(householdId, { month: key });
  const sweeps = planSweeps(states);

  let transfers = 0;
  for (const sweep of sweeps) {
    const result = await moveBetweenEnvelopes(householdId, {
      fromEnvelopeId: sweep.fromEnvelopeId,
      toEnvelopeId: sweep.toEnvelopeId,
      amountCents: sweep.amountCents,
      reason: "leftover",
      // Lo spostamento appartiene all'ultimo giorno del mese che si chiude.
      date: endOfMonth(key),
    });
    if (result.transferTodoId) transfers += 1;
  }

  await db
    .insert(monthCloses)
    .values({ householdId, month: key, closedBy: userId })
    .onConflictDoNothing();

  return { month: key, sweeps: sweeps.length, transferTodos: transfers, alreadyClosed: false };
}

export async function isMonthClosed(householdId: string, month: string): Promise<boolean> {
  const [row] = await db
    .select({ id: monthCloses.id })
    .from(monthCloses)
    .where(and(eq(monthCloses.householdId, householdId), eq(monthCloses.month, monthKey(month))))
    .limit(1);
  return Boolean(row);
}

export type AccountCheck = {
  accountId: string;
  accountName: string;
  currency: string;
  balanceCents: number;
  envelopesCents: number;
  unassignedCents: number;
  /** Le buste virtuali promettono piu di quanto il conto contenga. */
  overAssigned: boolean;
};

/**
 * Coerenza dei conti (F1.5.10): per ogni conto reale, la somma del
 * disponibile delle sue buste virtuali non puo superare il saldo.
 *
 * Quando supera, il piano promette soldi che sul conto non ci sono: di solito
 * e una spesa non ancora importata, un interesse o una commissione. L'app
 * mostra la differenza invece di lasciarla sotto il tappeto.
 */
export async function accountConsistency(
  householdId: string,
  month?: string,
): Promise<AccountCheck[]> {
  const [envelopeRows, balances, accountRows] = await Promise.all([
    listEnvelopes(householdId, { month }),
    latestBalances(householdId, endOfMonth(startOfMonth(month ?? today()))),
    db
      .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), eq(accounts.archived, false))),
  ]);

  return accountRows
    .map((account) => {
      const virtual = envelopeRows.filter(
        (envelope) => envelope.accountId === account.id && envelope.kind === "virtual",
      );
      if (virtual.length === 0) return null;

      const envelopesCents = virtual.reduce(
        (sum, envelope) => sum + Math.max(0, envelope.availableCents),
        0,
      );
      const balanceCents = balances.get(account.id)?.amount ?? 0;

      return {
        accountId: account.id,
        accountName: account.name,
        currency: account.currency.trim(),
        balanceCents,
        envelopesCents,
        unassignedCents: balanceCents - envelopesCents,
        overAssigned: envelopesCents > balanceCents,
      };
    })
    .filter((row): row is AccountCheck => row !== null);
}

/** Spese della busta nel mese, per il dettaglio. */
export async function envelopeTransactions(
  householdId: string,
  envelopeId: string,
  month: string,
) {
  const start = startOfMonth(month);
  const end = endOfMonth(start);
  return db
    .select({
      id: transactions.id,
      date: transactions.bookedDate,
      description: transactions.description,
      amount: transactions.amount,
      currency: transactions.currency,
      accountId: transactions.accountId,
      accountName: accounts.name,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.envelopeId, envelopeId),
        gte(transactions.bookedDate, start),
        lt(transactions.bookedDate, addMonths(start, 1)),
      ),
    )
    .orderBy(sql`${transactions.bookedDate} desc`);
}
