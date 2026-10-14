/**
 * Cambi valuta su base BCE.
 *
 * La BCE pubblica tassi con base EUR: un tasso `rate` significa
 * "1 EUR = rate unita di quella valuta". EUR ha quindi sempre tasso 1.
 * Per convertire tra due valute si passa da EUR.
 *
 * Regola di dominio: i totali usano il tasso del giorno del saldo, e il tasso
 * usato viene salvato accanto allo snapshot, cosi lo storico non cambia se
 * cambiano i tassi.
 */
import { currencyDigits, roundHalfAway } from "./money";

export type RateMap = Record<string, number>;

export class MissingRateError extends Error {
  constructor(readonly currency: string) {
    super(`Tasso di cambio mancante per ${currency}`);
    this.name = "MissingRateError";
  }
}

/** Tasso da `from` a `to` partendo dai tassi BCE con base EUR. */
export function crossRate(from: string, to: string, rates: RateMap): number {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return 1;
  const rateA = a === "EUR" ? 1 : rates[a];
  const rateB = b === "EUR" ? 1 : rates[b];
  if (!rateA || !Number.isFinite(rateA)) throw new MissingRateError(a);
  if (!rateB || !Number.isFinite(rateB)) throw new MissingRateError(b);
  return rateB / rateA;
}

/**
 * Converte un importo in unita minori da una valuta all'altra.
 * Tiene conto delle diverse cifre decimali (es. da JPY a EUR).
 */
export function convertMinor(cents: number, from: string, to: string, rate: number): number {
  if (from.toUpperCase() === to.toUpperCase()) return cents;
  const scale = 10 ** (currencyDigits(to) - currencyDigits(from));
  return roundHalfAway(cents * rate * scale);
}

/** Converte usando i tassi del giorno, restituendo anche il tasso applicato. */
export function convertWithRates(
  cents: number,
  from: string,
  to: string,
  rates: RateMap,
): { cents: number; rate: number } {
  const rate = crossRate(from, to, rates);
  return { cents: convertMinor(cents, from, to, rate), rate };
}

/**
 * Sceglie il tasso di un giorno dallo storico, risalendo al giorno utile
 * precedente: la BCE non pubblica nei weekend e nei festivi.
 */
export function rateAsOf(
  history: { date: string; currency: string; rate: number }[],
  currency: string,
  date: string,
): number | null {
  const code = currency.toUpperCase();
  if (code === "EUR") return 1;
  let best: { date: string; rate: number } | null = null;
  for (const row of history) {
    if (row.currency.toUpperCase() !== code) continue;
    if (row.date > date) continue;
    if (!best || row.date > best.date) best = { date: row.date, rate: row.rate };
  }
  return best?.rate ?? null;
}
