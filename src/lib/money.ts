/**
 * Denaro in unità minori (centesimi) come interi.
 *
 * Ogni importo nell'app è un intero di unità minori accompagnato da un codice
 * valuta ISO 4217. Non si usano mai float per il denaro: somme e sottrazioni su
 * interi sono esatte, e le moltiplicazioni (percentuali, cambi) passano sempre
 * da un arrotondamento esplicito.
 */

const digitsCache = new Map<string, number>();

/** Cifre decimali della valuta secondo ISO 4217 (EUR 2, JPY 0, TND 3). */
export function currencyDigits(currency: string): number {
  const code = currency.toUpperCase();
  const cached = digitsCache.get(code);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  digitsCache.set(code, digits);
  return digits;
}

function minorUnitFactor(currency: string): number {
  return 10 ** currencyDigits(currency);
}

export function isValidCurrency(currency: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(currency)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(1);
    return true;
  } catch {
    return false;
  }
}

/** Da unità minori a unità principali, per visualizzazione o export. */
export function toMajor(cents: number, currency = "EUR"): number {
  return cents / minorUnitFactor(currency);
}

/** Da unità principali a unità minori, con arrotondamento half-away-from-zero. */
export function toMinor(major: number, currency = "EUR"): number {
  return roundHalfAway(major * minorUnitFactor(currency));
}

/**
 * Arrotondamento half-away-from-zero: 0.5 -> 1, -0.5 -> -1.
 * `Math.round` arrotonda -0.5 a 0, rendendo asimmetrici i segni.
 */
export function roundHalfAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Applica una percentuale in punti base (10000 bps = 100%) a un importo intero. */
export function applyBps(cents: number, bps: number): number {
  return roundHalfAway((cents * bps) / 10_000);
}

/**
 * Ripartisce `cents` secondo dei pesi senza perdere né creare centesimi:
 * il resto dell'arrotondamento va alle quote con la parte frazionaria maggiore.
 */
export function distribute(cents: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (total <= 0) {
    // Nessun peso utile: tutto alla prima quota, così il totale resta esatto.
    return weights.map((_, i) => (i === 0 ? cents : 0));
  }
  const exact = weights.map((w) => (cents * w) / total);
  const floors = exact.map((v) => Math.floor(v));
  let rest = cents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (rest === 0) break;
    const step = rest > 0 ? 1 : -1;
    out[i] = (out[i] ?? 0) + step;
    rest -= step;
  }
  return out;
}

export function formatMoney(
  cents: number,
  currency: string,
  locale = "it",
  options: { showSign?: boolean; compact?: boolean } = {},
): string {
  const digits = currencyDigits(currency);
  const value = toMajor(cents, currency);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: options.compact && cents % minorUnitFactor(currency) === 0 ? 0 : digits,
    maximumFractionDigits: digits,
    signDisplay: options.showSign ? "exceptZero" : "auto",
  }).format(value);
  return formatted;
}

export function formatBps(bps: number, locale = "it"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: bps % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}

/**
 * Converte testo digitato dall'utente in unità minori, accettando sia la
 * notazione italiana (1.234,56) sia quella inglese (1,234.56).
 *
 * Regole, applicate in ordine:
 *  - si ignorano spazi, simboli di valuta e lettere;
 *  - con entrambi i separatori presenti, l'ultimo è quello decimale;
 *  - con un solo tipo di separatore ripetuto, è separatore di migliaia;
 *  - con un solo separatore, una coda di 3 cifre è migliaia ("1.500" = 1500),
 *    a meno che la parte intera sia vuota o zero ("0,123" = 0,12);
 *  - le cifre oltre la precisione della valuta arrotondano l'unità minore.
 */
export function parseAmountToCents(input: string, currency = "EUR"): number | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (s === "") return null;
  s = s.replace(/[^\d,.\-+]/g, "");
  if (s === "") return null;

  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (/[-+]/.test(s)) return null;
  if (!/^[\d,.]*$/.test(s)) return null;

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));

  let decimalAt = -1;
  if (commas > 0 && dots > 0) {
    decimalAt = lastSep;
  } else if (commas + dots === 1) {
    const intCandidate = s.slice(0, lastSep).replace(/[,.]/g, "");
    const tail = s.slice(lastSep + 1);
    const looksLikeThousands = tail.length === 3 && intCandidate !== "" && Number(intCandidate) !== 0;
    if (tail.length > 0 && !looksLikeThousands) decimalAt = lastSep;
  }

  const intPart = (decimalAt === -1 ? s : s.slice(0, decimalAt)).replace(/[,.]/g, "") || "0";
  const fracRaw = decimalAt === -1 ? "" : s.slice(decimalAt + 1);
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracRaw)) return null;

  const digits = currencyDigits(currency);
  const frac = (fracRaw + "0".repeat(digits)).slice(0, digits);
  const dropped = fracRaw.slice(digits);
  let cents = Number(intPart) * 10 ** digits + Number(frac || "0");
  if (dropped !== "" && Number(dropped[0]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return sign === -1 && cents === 0 ? 0 : sign * cents;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
