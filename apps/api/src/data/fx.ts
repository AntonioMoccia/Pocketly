/**
 * Tassi di cambio: lettura dal database e aggiornamento dalla BCE.
 *
 * Fonte: feed XML pubblico della Banca centrale europea, gratuito e ufficiale.
 * I tassi sono "unita di valuta per 1 EUR"; EUR non si salva, vale 1.
 */
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@api/db";
import { fxRates } from "@api/db/schema";
import type { RateMap } from "@pocketly/domain/fx";

const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const ECB_HIST_90D = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export type FxRow = { date: string; currency: string; unitsPerEur: number };

/**
 * Tassi validi a una data: si usa l'ultimo giorno pubblicato non successivo,
 * perche la BCE non pubblica nei weekend e nei festivi.
 */
export async function ratesForDate(date: string): Promise<RateMap> {
  const rows = await db
    .select({ currency: fxRates.currency, rate: fxRates.unitsPerEur })
    .from(fxRates)
    .where(
      eq(
        fxRates.date,
        sql`(select max(${fxRates.date}) from ${fxRates} where ${fxRates.date} <= ${date})`,
      ),
    );
  return toRateMap(rows);
}

export async function latestRates(): Promise<{ date: string | null; rates: RateMap }> {
  const [latest] = await db
    .select({ date: fxRates.date })
    .from(fxRates)
    .orderBy(desc(fxRates.date))
    .limit(1);
  if (!latest) return { date: null, rates: {} };
  const rows = await db
    .select({ currency: fxRates.currency, rate: fxRates.unitsPerEur })
    .from(fxRates)
    .where(eq(fxRates.date, latest.date));
  return { date: latest.date, rates: toRateMap(rows) };
}

/** Un solo tasso, risalendo al giorno utile precedente. */
export async function rateFor(currency: string, date: string): Promise<number | null> {
  const code = currency.trim().toUpperCase();
  if (code === "EUR") return 1;
  const [row] = await db
    .select({ rate: fxRates.unitsPerEur })
    .from(fxRates)
    .where(and(eq(fxRates.currency, code), lte(fxRates.date, date)))
    .orderBy(desc(fxRates.date))
    .limit(1);
  return row?.rate ?? null;
}

function toRateMap(rows: { currency: string; rate: number }[]): RateMap {
  const map: RateMap = {};
  for (const row of rows) map[row.currency.trim().toUpperCase()] = row.rate;
  return map;
}

/**
 * Scarica i tassi dalla BCE. `history` prende gli ultimi 90 giorni: serve al
 * primo avvio, cosi i saldi retrodatati trovano un tasso.
 */
export async function fetchEcbRates(options: { history?: boolean } = {}): Promise<FxRow[]> {
  const url = options.history ? ECB_HIST_90D : ECB_DAILY;
  const response = await fetch(url, {
    headers: { "User-Agent": "Pocketly/0.1 (+https://github.com/pocketly)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`BCE ha risposto ${response.status} ${response.statusText}`);
  }
  return parseEcbXml(await response.text());
}

/**
 * Estrae i tassi dal formato eurofxref della BCE, che annida i `Cube` per
 * giorno. Si legge con una regex invece di una dipendenza XML: il formato e
 * stabile da anni e il documento e piccolo.
 */
export function parseEcbXml(xml: string): FxRow[] {
  const out: FxRow[] = [];
  const dayBlocks = xml.split(/<Cube\s+time=['"]/).slice(1);
  for (const block of dayBlocks) {
    const date = block.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const rateRe = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = rateRe.exec(block)) !== null) {
      const [, currency, rate] = match as unknown as [string, string, string];
      const value = Number(rate);
      if (!Number.isFinite(value) || value <= 0) continue;
      out.push({ date, currency, unitsPerEur: value });
    }
  }
  return out;
}

/** Salva i tassi; ripetere lo stesso giorno aggiorna senza duplicare. */
export async function storeRates(rows: FxRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((row) => ({
    date: row.date,
    currency: row.currency.toUpperCase(),
    unitsPerEur: row.unitsPerEur,
  }));
  // Inserimento a blocchi: il feed storico porta oltre 2500 righe.
  let written = 0;
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    await db
      .insert(fxRates)
      .values(chunk)
      .onConflictDoUpdate({
        target: [fxRates.date, fxRates.currency],
        set: { unitsPerEur: sql`excluded.units_per_eur` },
      });
    written += chunk.length;
  }
  return written;
}

/** Aggiorna i tassi dalla BCE. Chiamata dal job giornaliero e a mano. */
export async function refreshRates(options: { history?: boolean } = {}): Promise<{
  written: number;
  latestDate: string | null;
}> {
  const rows = await fetchEcbRates(options);
  const written = await storeRates(rows);
  const latestDate = rows.reduce<string | null>(
    (max, row) => (max === null || row.date > max ? row.date : max),
    null,
  );
  return { written, latestDate };
}

/** Vero se non c'e nessun tasso: al primo avvio si scarica lo storico. */
export async function hasAnyRate(): Promise<boolean> {
  const [row] = await db.select({ date: fxRates.date }).from(fxRates).limit(1);
  return Boolean(row);
}
