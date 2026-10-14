/**
 * Date di calendario come stringhe `YYYY-MM-DD`.
 *
 * Un saldo "del 14 ottobre" e una data di calendario, non un istante: tenerla
 * come stringa evita che un fuso orario la sposti di un giorno, che su un
 * confine di mese sposterebbe uno snapshot nel mese sbagliato.
 */
export type IsoDate = string;

export function today(timeZone?: string): IsoDate {
  return toIsoDate(new Date(), timeZone);
}

export function toIsoDate(date: Date, timeZone?: string): IsoDate {
  if (!timeZone) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  // `en-CA` formatta come YYYY-MM-DD, che e esattamente il formato ISO voluto.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(parseIsoDate(value).getTime());
}

/** Interpreta una data di calendario a mezzanotte UTC, senza slittamenti. */
export function parseIsoDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(value: IsoDate, months: number): IsoDate {
  const date = parseIsoDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  // Il 31 gennaio piu un mese resta a febbraio, non salta a marzo.
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function startOfMonth(value: IsoDate): IsoDate {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: IsoDate): IsoDate {
  const date = parseIsoDate(value);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Etichetta del mese per i grafici: "ott 2026". */
export function monthLabel(value: IsoDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
    parseIsoDate(value),
  );
}

export function formatDate(value: IsoDate, locale: string, style: "short" | "long" = "short"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: style === "long" ? "long" : "medium",
    timeZone: "UTC",
  }).format(parseIsoDate(value));
}
