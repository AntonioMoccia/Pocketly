/**
 * Lettura degli estratti conto in CSV (F1.5.1).
 *
 * Il parser e scritto a mano: un CSV bancario e piccolo, e una dipendenza in
 * piu nel container si paga a ogni aggiornamento. Gestisce virgolette, campi
 * con il separatore dentro, BOM e fine riga Windows, che e esattamente cio che
 * esportano le banche italiane.
 */
import { parseAmountToCents } from "./money";
import { isIsoDate } from "./date";

export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: string;
};

const DELIMITERS = [",", ";", "\t", "|"] as const;

/** Indovina il separatore contando le occorrenze fuori dalle virgolette. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  let best = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const char = sample[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (!inQuotes && char === delimiter) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter?: string): CsvTable {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  const headers = (nonEmpty.shift() ?? []).map((header) => header.trim());
  return { headers, rows: nonEmpty, delimiter: sep };
}

export type ColumnMap = {
  date: string;
  description: string;
  amount: string;
  currency?: string;
  counterparty?: string;
  /** Colonne separate per uscite ed entrate, come usano diverse banche. */
  debit?: string;
  credit?: string;
  state?: string;
};

export type ParsedRow = {
  date: string;
  description: string;
  counterparty: string | null;
  amountCents: number;
  currency: string | null;
  raw: Record<string, string>;
};

export type RowError = { line: number; reason: "date" | "amount" | "empty"; raw: string };

export type ParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
};

/**
 * Trasforma le righe grezze in movimenti. Una riga illeggibile non ferma
 * l'import: finisce tra gli errori e le altre passano comunque.
 */
export function mapRows(
  table: CsvTable,
  map: ColumnMap,
  options: { decimalSeparator?: string; currency?: string; dateFormat?: string } = {},
): ParseResult {
  const index = (name: string | undefined): number =>
    name ? table.headers.findIndex((header) => header.toLowerCase() === name.toLowerCase()) : -1;

  const columns = {
    date: index(map.date),
    description: index(map.description),
    amount: index(map.amount),
    currency: index(map.currency),
    counterparty: index(map.counterparty),
    debit: index(map.debit),
    credit: index(map.credit),
  };

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  table.rows.forEach((cells, position) => {
    const line = position + 2; // +1 per l'intestazione, +1 per partire da 1
    const get = (column: number) => (column >= 0 ? (cells[column] ?? "").trim() : "");

    const raw: Record<string, string> = {};
    table.headers.forEach((header, i) => {
      raw[header] = (cells[i] ?? "").trim();
    });

    const dateText = get(columns.date);
    const description = get(columns.description);
    if (dateText === "" && description === "") {
      return;
    }

    const date = parseDate(dateText, options.dateFormat);
    if (!date) {
      errors.push({ line, reason: "date", raw: cells.join(" ") });
      return;
    }

    const currency = normalizeCurrency(get(columns.currency)) ?? options.currency ?? null;
    const amountCents = readAmount(get, columns, currency ?? "EUR");
    if (amountCents === null) {
      errors.push({ line, reason: "amount", raw: cells.join(" ") });
      return;
    }

    rows.push({
      date,
      description: description || get(columns.counterparty) || "-",
      counterparty: get(columns.counterparty) || null,
      amountCents,
      currency,
      raw,
    });
  });

  return { rows, errors };
}

const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };

/**
 * Una valuta letta dal file vale solo se e un codice ISO di tre lettere: un
 * simbolo, una parola o una data finita nella colonna sbagliata farebbero
 * esplodere `Intl.NumberFormat` a schermo. Altrimenti vale quella del conto.
 */
function normalizeCurrency(text: string): string | null {
  const value = text.trim().toUpperCase();
  const code = CURRENCY_SYMBOLS[value] ?? value;
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function readAmount(
  get: (column: number) => string,
  columns: { amount: number; debit: number; credit: number },
  currency: string,
): number | null {
  if (columns.amount >= 0) {
    const text = get(columns.amount);
    if (text !== "") return parseAmountToCents(text, currency);
  }
  // Due colonne: dare e avere. L'uscita e negativa anche se scritta senza segno.
  const debit = columns.debit >= 0 ? parseAmountToCents(get(columns.debit), currency) : null;
  const credit = columns.credit >= 0 ? parseAmountToCents(get(columns.credit), currency) : null;
  if (debit !== null && debit !== 0) return -Math.abs(debit);
  if (credit !== null && credit !== 0) return Math.abs(credit);
  if (debit === 0 || credit === 0) return 0;
  return null;
}

/**
 * Legge una data in uno dei formati usati dalle banche. Con giorno e mese
 * entrambi <= 12 la forma e ambigua: senza un formato dichiarato si assume
 * giorno/mese, che e la convenzione europea.
 */
export function parseDate(value: string, format?: string): string | null {
  const text = value.trim();
  if (text === "") return null;

  // ISO, eventualmente con l'ora: la parte della data basta.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isIsoDate(candidate) ? candidate : null;
  }

  const parts = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    let year = Number(parts[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;

    // Il formato dichiarato vince. Senza, si guarda quale dei due numeri non
    // puo essere un mese; se sono ambigui entrambi vale la convenzione
    // europea giorno/mese.
    const monthFirst =
      format === "MM/DD/YYYY" ? true : format === "DD/MM/YYYY" ? false : first <= 12 && second > 12;

    const day = monthFirst ? second : first;
    const month = monthFirst ? first : second;
    const candidate = `${year}-${pad(month)}-${pad(day)}`;
    return isIsoDate(candidate) ? candidate : null;
  }

  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Impronta di una riga per la deduplica: stesso conto, stessa data, stesso
 * importo e stessa descrizione sono lo stesso movimento. Lo stesso estratto
 * conto importato due volte non crea doppioni (criterio di accettazione).
 */
export function fingerprint(row: {
  date: string;
  amountCents: number;
  description: string;
  counterparty?: string | null;
}): string {
  const parts = [
    row.date,
    String(row.amountCents),
    normalizeForFingerprint(row.description),
    normalizeForFingerprint(row.counterparty ?? ""),
  ];
  return parts.join("|");
}

function normalizeForFingerprint(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Indovina la mappatura delle colonne dalle intestazioni note delle banche
 * italiane e di Revolut, cosi il profilo si configura quasi da solo.
 */
export function guessColumnMap(headers: string[]): Partial<ColumnMap> {
  // Si scorre la lista dei nomi attesi, non quella delle intestazioni: conta
  // quale candidato e piu preciso, non quale colonna viene prima nel file.
  // Revolut, per esempio, ha sia "Started Date" sia "Completed Date", e la
  // data che vale e la seconda.
  const find = (candidates: string[], { exactOnly = false } = {}): string | undefined => {
    const clean = (header: string) => header.toLowerCase().trim();
    for (const candidate of candidates) {
      const exact = headers.find((header) => clean(header) === candidate);
      if (exact) return exact;
    }
    if (exactOnly) return undefined;
    for (const candidate of candidates) {
      const partial = headers.find((header) => clean(header).includes(candidate));
      if (partial) return partial;
    }
    return undefined;
  };

  return {
    date: find([
      "completed date",
      "data contabile",
      "data valuta",
      "data operazione",
      "booking date",
      "data",
      "date",
    ]),
    description: find(["description", "descrizione", "causale", "dettagli", "merchant"]),
    amount: find(["amount", "importo", "valore"]),
    // "Data valuta" e una data, non una valuta: niente ricerca parziale qui.
    currency: find(["currency", "valuta", "divisa"], { exactOnly: true }),
    counterparty: find(["counterparty", "controparte", "beneficiario", "ordinante", "payee"]),
    debit: find(["uscite", "dare", "addebiti", "debit", "paid out"]),
    credit: find(["entrate", "avere", "accrediti", "credit", "paid in"]),
    state: find(["state", "stato", "status"]),
  };
}
