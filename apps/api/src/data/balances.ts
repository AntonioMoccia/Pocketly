/**
 * Aggiornamento rapido dei saldi (F1.5).
 *
 * Il saldo di un conto a una data si scrive una volta sola: un secondo
 * salvataggio per lo stesso giorno corregge il precedente. Il tasso verso la
 * valuta base viene fissato qui e salvato nella riga, perche lo storico non
 * cambi se domani cambiano i tassi.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@api/db";
import { accounts, balanceSnapshots } from "@api/db/schema";
import { crossRate } from "@pocketly/domain/fx";
import { ratesForDate } from "./fx";
import { DomainError } from "./accounts";

export type BalanceUpdate = {
  accountId: string;
  /** Importo in unita minori della valuta del conto. */
  amount: number;
};

export type SaveBalancesResult = {
  saved: number;
  skipped: string[];
};

/**
 * Salva piu saldi in una transazione: o passano tutti, o nessuno. Un
 * aggiornamento a meta lascerebbe un patrimonio incoerente.
 */
export async function saveBalances(
  householdId: string,
  date: string,
  updates: BalanceUpdate[],
  options: { userId: string; baseCurrency: string; source?: "manual" | "csv" | "bank" },
): Promise<SaveBalancesResult> {
  if (updates.length === 0) return { saved: 0, skipped: [] };

  // Solo i Pocket hanno un saldo: quello di un conto principale e la somma
  // dei suoi Pocket, e scriverlo lo conterebbe due volte.
  const own = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), isNotNull(accounts.parentId)));
  const currencyById = new Map(own.map((row) => [row.id, row.currency.trim()]));

  const rates = await ratesForDate(date);
  const skipped: string[] = [];
  const rows: (typeof balanceSnapshots.$inferInsert)[] = [];

  for (const update of updates) {
    const currency = currencyById.get(update.accountId);
    if (!currency) {
      // Conto principale, di un altro household o inesistente: non si scrive.
      skipped.push(update.accountId);
      continue;
    }
    if (!Number.isSafeInteger(update.amount)) {
      skipped.push(update.accountId);
      continue;
    }
    rows.push({
      householdId,
      accountId: update.accountId,
      date,
      amount: update.amount,
      currency,
      source: options.source ?? "manual",
      rateToBase: rateToBase(currency, options.baseCurrency, rates),
      createdBy: options.userId,
    });
  }

  if (rows.length === 0) return { saved: 0, skipped };

  await db
    .insert(balanceSnapshots)
    .values(rows)
    .onConflictDoUpdate({
      target: [balanceSnapshots.accountId, balanceSnapshots.date],
      set: {
        amount: sql`excluded.amount`,
        currency: sql`excluded.currency`,
        source: sql`excluded.source`,
        rateToBase: sql`excluded.rate_to_base`,
        createdBy: sql`excluded.created_by`,
        createdAt: sql`now()`,
      },
    });

  return { saved: rows.length, skipped };
}

/** Tasso del giorno verso la valuta base; null se non disponibile. */
export function rateToBase(
  currency: string,
  baseCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (currency.toUpperCase() === baseCurrency.toUpperCase()) return 1;
  try {
    return crossRate(currency, baseCurrency, rates);
  } catch {
    return null;
  }
}

/** Saldo singolo, usato dal dettaglio conto e dagli investimenti. */
export async function saveBalance(
  householdId: string,
  accountId: string,
  date: string,
  amount: number,
  options: { userId: string; baseCurrency: string; note?: string | null },
): Promise<void> {
  const result = await saveBalances(householdId, date, [{ accountId, amount }], options);
  if (result.saved === 0) throw new DomainError("accountNotFound");
  if (options.note !== undefined) {
    await db
      .update(balanceSnapshots)
      .set({ note: options.note })
      .where(
        and(eq(balanceSnapshots.accountId, accountId), eq(balanceSnapshots.date, date)),
      );
  }
}

export async function deleteBalance(householdId: string, snapshotId: string): Promise<void> {
  await db
    .delete(balanceSnapshots)
    .where(
      and(eq(balanceSnapshots.id, snapshotId), eq(balanceSnapshots.householdId, householdId)),
    );
}
