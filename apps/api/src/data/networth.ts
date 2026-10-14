/**
 * Patrimonio: calcolo corrente e snapshot storici (F1.11, F1.12).
 *
 * Lo snapshot salva anche i tassi usati, cosi il totale di un mese passato
 * resta riproducibile e non si muove quando cambiano i cambi.
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@api/db";
import { netWorthSnapshots } from "@api/db/schema";
import { computeNetWorth, type NetWorth } from "@pocketly/domain/networth";
import { addMonths, today } from "@pocketly/domain/date";
import { listAccounts } from "./accounts";
import { ratesForDate } from "./fx";

export type NetWorthNow = NetWorth & {
  baseCurrency: string;
  asOf: string;
};

export async function currentNetWorth(
  householdId: string,
  baseCurrency: string,
  asOf = today(),
): Promise<NetWorthNow> {
  const [accounts, rates] = await Promise.all([
    listAccounts(householdId, { asOf }),
    ratesForDate(asOf),
  ]);
  return { ...computeNetWorth(accounts, baseCurrency, rates), baseCurrency, asOf };
}

/**
 * Scrive lo snapshot del giorno. Ripetuto lo stesso giorno lo aggiorna: il job
 * mensile e la chiusura di un giorno di paga possono cadere nella stessa data.
 */
export async function saveNetWorthSnapshot(
  householdId: string,
  baseCurrency: string,
  date = today(),
): Promise<NetWorthNow> {
  const [accounts, rates] = await Promise.all([
    listAccounts(householdId, { asOf: date }),
    ratesForDate(date),
  ]);
  const result = computeNetWorth(accounts, baseCurrency, rates);

  // Si salvano solo i tassi delle valute davvero in uso: tenere tutto il
  // listino BCE in ogni riga gonfierebbe la tabella senza aggiungere nulla.
  const used: Record<string, number> = {};
  for (const account of accounts) {
    const code = account.currency.toUpperCase();
    if (code === baseCurrency.toUpperCase()) continue;
    const rate = account.rateToBase ?? rates[code];
    if (typeof rate === "number") used[code] = rate;
  }

  await db
    .insert(netWorthSnapshots)
    .values({
      householdId,
      date,
      total: result.totalCents,
      liquid: result.liquidCents,
      currency: baseCurrency,
      byCategory: result.byCategory,
      rates: used,
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.householdId, netWorthSnapshots.date],
      set: {
        total: sql`excluded.total`,
        liquid: sql`excluded.liquid`,
        currency: sql`excluded.currency`,
        byCategory: sql`excluded.by_category`,
        rates: sql`excluded.rates`,
      },
    });

  return { ...result, baseCurrency, asOf: date };
}

export type SnapshotRow = {
  date: string;
  total: number;
  liquid: number;
  currency: string;
  byCategory: Record<string, number>;
};

export async function netWorthHistory(
  householdId: string,
  months = 24,
): Promise<SnapshotRow[]> {
  const from = addMonths(today(), -months);
  const rows = await db
    .select({
      date: netWorthSnapshots.date,
      total: netWorthSnapshots.total,
      liquid: netWorthSnapshots.liquid,
      currency: netWorthSnapshots.currency,
      byCategory: netWorthSnapshots.byCategory,
    })
    .from(netWorthSnapshots)
    .where(and(eq(netWorthSnapshots.householdId, householdId), gte(netWorthSnapshots.date, from)))
    .orderBy(asc(netWorthSnapshots.date));
  return rows.map((row) => ({ ...row, currency: row.currency.trim() }));
}

/** Snapshot piu recente prima di una data: serve al confronto mensile. */
export async function previousSnapshot(
  householdId: string,
  before: string,
): Promise<SnapshotRow | null> {
  const [row] = await db
    .select({
      date: netWorthSnapshots.date,
      total: netWorthSnapshots.total,
      liquid: netWorthSnapshots.liquid,
      currency: netWorthSnapshots.currency,
      byCategory: netWorthSnapshots.byCategory,
    })
    .from(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.householdId, householdId),
        sql`${netWorthSnapshots.date} < ${before}`,
      ),
    )
    .orderBy(desc(netWorthSnapshots.date))
    .limit(1);
  return row ? { ...row, currency: row.currency.trim() } : null;
}
