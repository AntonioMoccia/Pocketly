/**
 * Conti e Pocket: letture con saldo corrente, scritture e controlli di dominio.
 *
 * Ogni query filtra per `householdId`: e il confine tra household.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, balanceSnapshots, institutions, users } from "@/db/schema";
import { isValidCurrency } from "@/lib/money";
import type { AccountCategory, AccountForTotals } from "@/lib/networth";
import { today } from "@/lib/date";
import { DomainError } from "@/lib/errors";

export type AccountWithBalance = AccountForTotals & {
  type: string;
  institutionId: string | null;
  institutionName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  note: string | null;
  balanceDate: string | null;
  balanceSource: string | null;
};

/**
 * Tutti i conti con il saldo valido a una data: l'ultimo snapshot non
 * successivo. Un conto senza snapshot ha saldo 0.
 */
export async function listAccounts(
  householdId: string,
  options: { asOf?: string; includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  const asOf = options.asOf ?? today();

  const rows = await db
    .select({
      id: accounts.id,
      parentId: accounts.parentId,
      name: accounts.name,
      type: accounts.type,
      category: accounts.category,
      currency: accounts.currency,
      liquid: accounts.liquid,
      archived: accounts.archived,
      note: accounts.note,
      institutionId: accounts.institutionId,
      institutionName: institutions.name,
      ownerUserId: accounts.ownerUserId,
      ownerName: users.name,
    })
    .from(accounts)
    .leftJoin(institutions, eq(institutions.id, accounts.institutionId))
    .leftJoin(users, eq(users.id, accounts.ownerUserId))
    .where(
      options.includeArchived
        ? eq(accounts.householdId, householdId)
        : and(eq(accounts.householdId, householdId), eq(accounts.archived, false)),
    )
    .orderBy(asc(accounts.sortOrder), asc(accounts.name));

  const balances = await latestBalances(householdId, asOf);

  return rows.map((row) => {
    const balance = balances.get(row.id);
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      type: row.type,
      category: row.category as AccountCategory,
      currency: row.currency.trim(),
      liquid: row.liquid,
      archived: row.archived,
      balanceCents: balance?.amount ?? 0,
      rateToBase: balance?.rateToBase ?? null,
      balanceDate: balance?.date ?? null,
      balanceSource: balance?.source ?? null,
      institutionId: row.institutionId,
      institutionName: row.institutionName,
      ownerUserId: row.ownerUserId,
      ownerName: row.ownerName,
      note: row.note,
    };
  });
}

export type LatestBalance = {
  amount: number;
  date: string;
  currency: string;
  rateToBase: number | null;
  source: string;
};

/**
 * Ultimo saldo per conto entro una data, uno per conto.
 * `distinct on` di Postgres fa in una query quello che altrimenti sarebbe una
 * sottoquery correlata per ogni conto.
 */
export async function latestBalances(
  householdId: string,
  asOf: string,
): Promise<Map<string, LatestBalance>> {
  const rows = await db.execute<{
    account_id: string;
    date: string;
    amount: string | number;
    currency: string;
    rate_to_base: number | null;
    source: string;
  }>(sql`
    select distinct on (account_id)
      account_id, date, amount, currency, rate_to_base, source
    from balance_snapshots
    where household_id = ${householdId} and date <= ${asOf}
    order by account_id, date desc, created_at desc
  `);

  const map = new Map<string, LatestBalance>();
  for (const row of rows) {
    map.set(row.account_id, {
      amount: Number(row.amount),
      date: row.date,
      currency: row.currency.trim(),
      rateToBase: row.rate_to_base,
      source: row.source,
    });
  }
  return map;
}

export async function getAccount(
  householdId: string,
  accountId: string,
): Promise<AccountWithBalance | null> {
  const all = await listAccounts(householdId, { includeArchived: true });
  return all.find((account) => account.id === accountId) ?? null;
}

export async function listInstitutions(householdId: string) {
  return db
    .select({
      id: institutions.id,
      name: institutions.name,
      country: institutions.country,
      provider: institutions.provider,
    })
    .from(institutions)
    .where(
      sql`${institutions.householdId} = ${householdId} or ${institutions.householdId} is null`,
    )
    .orderBy(asc(institutions.name));
}

export async function findOrCreateInstitution(
  householdId: string,
  name: string,
): Promise<string | null> {
  const clean = name.trim();
  if (clean === "") return null;
  const [existing] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(
      and(
        sql`lower(${institutions.name}) = lower(${clean})`,
        sql`${institutions.householdId} = ${householdId} or ${institutions.householdId} is null`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(institutions)
    .values({ householdId, name: clean, provider: "manual" })
    .returning({ id: institutions.id });
  return created?.id ?? null;
}

export type AccountInput = {
  name: string;
  type: "checking" | "savings" | "pocket" | "investment" | "cash" | "other";
  category: AccountCategory;
  currency: string;
  liquid: boolean;
  parentId: string | null;
  institutionId: string | null;
  ownerUserId: string | null;
  note: string | null;
};

export { DomainError } from "@/lib/errors";

/**
 * Controlli che non si possono esprimere come vincoli SQL:
 *  - il conto padre deve stare nello stesso household;
 *  - un Pocket non puo diventare figlio di un proprio discendente (ciclo);
 *  - un Pocket condivide la valuta del conto che lo contiene, altrimenti il
 *    totale del padre mescolerebbe valute diverse.
 */
async function validateParent(
  householdId: string,
  parentId: string | null,
  currency: string,
  selfId?: string,
): Promise<void> {
  if (!parentId) return;
  const [parent] = await db
    .select({ id: accounts.id, currency: accounts.currency, parentId: accounts.parentId })
    .from(accounts)
    .where(and(eq(accounts.id, parentId), eq(accounts.householdId, householdId)))
    .limit(1);
  if (!parent) throw new DomainError("accountNotFound");
  if (parent.currency.trim() !== currency.trim()) {
    throw new DomainError("pocketOfPocketCurrency");
  }
  if (selfId) {
    if (parentId === selfId) throw new DomainError("cycleNotAllowed");
    // Risale la catena: se incontra se stesso, il legame creerebbe un ciclo.
    let cursor: string | null = parent.parentId;
    const seen = new Set<string>([parentId]);
    while (cursor) {
      if (cursor === selfId) throw new DomainError("cycleNotAllowed");
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const [next] = await db
        .select({ parentId: accounts.parentId })
        .from(accounts)
        .where(eq(accounts.id, cursor))
        .limit(1);
      cursor = next?.parentId ?? null;
    }
  }
}

export async function createAccount(
  householdId: string,
  input: AccountInput,
  initialBalance?: { amount: number; date: string; rateToBase: number | null; userId: string },
): Promise<string> {
  const currency = input.currency.trim().toUpperCase();
  if (!isValidCurrency(currency)) throw new DomainError("invalidCurrency");
  await validateParent(householdId, input.parentId, currency);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(accounts)
      .values({
        householdId,
        name: input.name.trim(),
        type: input.type,
        category: input.category,
        currency,
        liquid: input.liquid,
        parentId: input.parentId,
        institutionId: input.institutionId,
        ownerUserId: input.ownerUserId,
        note: input.note?.trim() || null,
      })
      .returning({ id: accounts.id });
    if (!created) throw new DomainError("accountNotFound");

    if (initialBalance) {
      await tx.insert(balanceSnapshots).values({
        householdId,
        accountId: created.id,
        date: initialBalance.date,
        amount: initialBalance.amount,
        currency,
        source: "manual",
        rateToBase: initialBalance.rateToBase,
        createdBy: initialBalance.userId,
      });
    }
    return created.id;
  });
}

export async function updateAccount(
  householdId: string,
  accountId: string,
  input: AccountInput,
): Promise<void> {
  const currency = input.currency.trim().toUpperCase();
  if (!isValidCurrency(currency)) throw new DomainError("invalidCurrency");
  await validateParent(householdId, input.parentId, currency, accountId);

  const result = await db
    .update(accounts)
    .set({
      name: input.name.trim(),
      type: input.type,
      category: input.category,
      currency,
      liquid: input.liquid,
      parentId: input.parentId,
      institutionId: input.institutionId,
      ownerUserId: input.ownerUserId,
      note: input.note?.trim() || null,
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
    .returning({ id: accounts.id });
  if (result.length === 0) throw new DomainError("accountNotFound");
}

export async function setArchived(
  householdId: string,
  accountId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(accounts)
    .set({ archived })
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)));
}

export async function deleteAccount(householdId: string, accountId: string): Promise<void> {
  const result = await db
    .delete(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
    .returning({ id: accounts.id });
  if (result.length === 0) throw new DomainError("accountNotFound");
}

/** Storico saldi di un conto, dal piu recente. */
export async function accountHistory(householdId: string, accountId: string, limit = 60) {
  return db
    .select({
      id: balanceSnapshots.id,
      date: balanceSnapshots.date,
      amount: balanceSnapshots.amount,
      currency: balanceSnapshots.currency,
      source: balanceSnapshots.source,
      note: balanceSnapshots.note,
    })
    .from(balanceSnapshots)
    .where(
      and(
        eq(balanceSnapshots.householdId, householdId),
        eq(balanceSnapshots.accountId, accountId),
      ),
    )
    .orderBy(desc(balanceSnapshots.date))
    .limit(limit);
}

/** Conti di un household usabili come destinazione di ripartizione. */
export async function selectableAccounts(householdId: string) {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      parentId: accounts.parentId,
      category: accounts.category,
    })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), eq(accounts.archived, false)))
    .orderBy(asc(accounts.name));
}

/** Nomi dei conti per id, per le etichette di righe e checklist. */
export async function accountNames(
  householdId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), inArray(accounts.id, ids)));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Conti comuni (senza intestatario), utili alle viste di coppia della fase 2. */
export async function sharedAccounts(householdId: string) {
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), isNull(accounts.ownerUserId)));
}
