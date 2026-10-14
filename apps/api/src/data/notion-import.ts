/**
 * Import delle tabelle esportate da Notion (F1.15).
 *
 * Serve a non ripartire da zero: chi arriva da un sistema fatto a mano in
 * Notion porta dentro conti, saldi e versamenti con un file, invece di
 * ribattere tutto.
 *
 * Notion esporta CSV con le intestazioni che l'utente ha scelto, quindi le
 * colonne si riconoscono per sinonimi e il risultato si mostra in anteprima
 * prima di scrivere qualsiasi cosa.
 */
import { db } from "@api/db";
import { contributions } from "@api/db/schema";
import { parseCsv, parseDate, type CsvTable } from "@pocketly/domain/csv";
import { isValidCurrency, parseAmountToCents } from "@pocketly/domain/money";
import { today } from "@pocketly/domain/date";
import { DomainError } from "@pocketly/domain/errors";
import { createAccount, listAccounts } from "./accounts";
import { ensureEnvelopeForAccount } from "./envelopes";
import { rateToBase } from "./balances";
import { ratesForDate } from "./fx";
import type { AccountCategory } from "@pocketly/domain/networth";

export type NotionKind = "accounts" | "contributions";

export type NotionAccountRow = {
  name: string;
  institution: string | null;
  parent: string | null;
  currency: string;
  category: AccountCategory;
  liquid: boolean;
  balanceCents: number | null;
  /** Esiste gia un conto con questo nome: verrebbe saltato. */
  duplicate: boolean;
};

export type NotionContributionRow = {
  accountName: string;
  date: string;
  amountCents: number;
  kind: "deposit" | "withdrawal";
  /** Nessun conto con questo nome: la riga non si puo importare. */
  unknownAccount: boolean;
};

export type NotionPreview =
  | { kind: "accounts"; rows: NotionAccountRow[]; errors: string[] }
  | { kind: "contributions"; rows: NotionContributionRow[]; errors: string[] };

/** Cerca una colonna tra piu nomi possibili, dal piu preciso al piu generico. */
function column(table: CsvTable, candidates: string[]): number {
  const clean = (value: string) => value.toLowerCase().trim();
  for (const candidate of candidates) {
    const exact = table.headers.findIndex((header) => clean(header) === candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const partial = table.headers.findIndex((header) => clean(header).includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

const CATEGORY_WORDS: [RegExp, AccountCategory][] = [
  [/emergen/i, "emergency_fund"],
  [/garantit|vincolat|guarantee/i, "guaranteed_capital"],
  [/invest|etf|pac|fond/i, "investments"],
  [/pocket|busta/i, "pocket"],
];

function guessCategory(text: string, hasParent: boolean): AccountCategory {
  for (const [pattern, category] of CATEGORY_WORDS) {
    if (pattern.test(text)) return category;
  }
  return hasParent ? "pocket" : "operational";
}

export async function previewNotion(
  householdId: string,
  kind: NotionKind,
  text: string,
  baseCurrency: string,
): Promise<NotionPreview> {
  const table = parseCsv(text);
  const errors: string[] = [];
  const existing = await listAccounts(householdId, { includeArchived: true });
  const byName = new Map(existing.map((account) => [account.name.toLowerCase().trim(), account]));

  if (kind === "accounts") {
    const nameAt = column(table, ["nome", "name", "conto", "account", "titolo", "title"]);
    const balanceAt = column(table, ["saldo", "balance", "importo", "valore", "amount"]);
    const institutionAt = column(table, ["istituto", "banca", "bank", "institution"]);
    const parentAt = column(table, ["conto padre", "parent", "dentro", "contenuto in"]);
    const currencyAt = column(table, ["valuta", "currency", "divisa"]);
    const categoryAt = column(table, ["categoria", "category", "tipo", "type"]);

    if (nameAt < 0) throw new DomainError("notionColumns");

    const rows: NotionAccountRow[] = [];
    const seen = new Set<string>();

    table.rows.forEach((cells, index) => {
      const get = (at: number) => (at >= 0 ? (cells[at] ?? "").trim() : "");
      const name = get(nameAt);
      if (name === "") return;

      const currencyText = get(currencyAt).toUpperCase();
      const currency = isValidCurrency(currencyText) ? currencyText : baseCurrency;

      const balanceText = get(balanceAt);
      const balanceCents = balanceText === "" ? null : parseAmountToCents(balanceText, currency);
      if (balanceText !== "" && balanceCents === null) {
        errors.push(`Riga ${index + 2}: importo non leggibile ("${balanceText}")`);
      }

      const parent = get(parentAt) || null;
      const category = guessCategory(`${get(categoryAt)} ${name}`, parent !== null);
      const key = name.toLowerCase();

      rows.push({
        name,
        institution: get(institutionAt) || null,
        parent,
        currency,
        category,
        // Investimenti e capitale garantito non contano nel liquido.
        liquid: category !== "investments" && category !== "guaranteed_capital",
        balanceCents,
        duplicate: byName.has(key) || seen.has(key),
      });
      seen.add(key);
    });

    return { kind: "accounts", rows, errors };
  }

  const accountAt = column(table, ["conto", "account", "strumento", "nome", "name"]);
  const dateAt = column(table, ["data", "date", "mese", "month"]);
  const amountAt = column(table, ["importo", "amount", "versato", "valore"]);
  const kindAt = column(table, ["tipo", "kind", "operazione"]);

  if (accountAt < 0 || amountAt < 0) throw new DomainError("notionColumns");

  const rows: NotionContributionRow[] = [];
  table.rows.forEach((cells, index) => {
    const get = (at: number) => (at >= 0 ? (cells[at] ?? "").trim() : "");
    const accountName = get(accountAt);
    if (accountName === "") return;

    const amountCents = parseAmountToCents(get(amountAt), baseCurrency);
    if (amountCents === null) {
      errors.push(`Riga ${index + 2}: importo non leggibile`);
      return;
    }

    const date = parseDate(get(dateAt)) ?? today();
    const kindText = get(kindAt).toLowerCase();

    rows.push({
      accountName,
      date,
      amountCents: Math.abs(amountCents),
      kind: /rimbors|prelie|withdraw/.test(kindText) || amountCents < 0 ? "withdrawal" : "deposit",
      unknownAccount: !byName.has(accountName.toLowerCase().trim()),
    });
  });

  return { kind: "contributions", rows, errors };
}

export type NotionImportResult = { created: number; skipped: number };

/** Scrive quello che l'anteprima ha mostrato, saltando duplicati e righe orfane. */
export async function commitNotion(
  householdId: string,
  preview: NotionPreview,
  options: { userId: string; baseCurrency: string },
): Promise<NotionImportResult> {
  const date = today();
  const rates = await ratesForDate(date);
  let created = 0;
  let skipped = 0;

  if (preview.kind === "accounts") {
    // I conti padre si creano per primi: un Pocket ha bisogno del suo conto.
    const ordered = [...preview.rows].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));
    const idsByName = new Map<string, string>();
    for (const account of await listAccounts(householdId, { includeArchived: true })) {
      idsByName.set(account.name.toLowerCase().trim(), account.id);
    }

    for (const row of ordered) {
      if (row.duplicate) {
        skipped += 1;
        continue;
      }

      const parentId = row.parent ? (idsByName.get(row.parent.toLowerCase().trim()) ?? null) : null;
      const institutionId = row.institution
        ? await (await import("./accounts")).findOrCreateInstitution(householdId, row.institution)
        : null;

      // Un Pocket condivide la valuta del conto che lo contiene.
      const parentCurrency = parentId
        ? (await listAccounts(householdId, { includeArchived: true })).find(
            (account) => account.id === parentId,
          )?.currency
        : null;
      const currency = parentCurrency ?? row.currency;

      const accountId = await createAccount(
        householdId,
        {
          name: row.name,
          type: parentId ? "pocket" : "checking",
          category: row.category,
          currency,
          liquid: row.liquid,
          parentId,
          institutionId,
          ownerUserId: null,
          note: null,
        },
        row.balanceCents === null
          ? undefined
          : {
              amount: row.balanceCents,
              date,
              rateToBase: rateToBase(currency, options.baseCurrency, rates),
              userId: options.userId,
            },
      );

      idsByName.set(row.name.toLowerCase().trim(), accountId);
      await ensureEnvelopeForAccount(householdId, accountId, row.name, created % 7);
      created += 1;
    }

    return { created, skipped };
  }

  const byName = new Map(
    (await listAccounts(householdId, { includeArchived: true })).map((account) => [
      account.name.toLowerCase().trim(),
      account,
    ]),
  );

  const values: (typeof contributions.$inferInsert)[] = [];
  for (const row of preview.rows) {
    const account = byName.get(row.accountName.toLowerCase().trim());
    if (!account) {
      skipped += 1;
      continue;
    }
    values.push({
      householdId,
      accountId: account.id,
      date: row.date,
      amount: row.amountCents,
      currency: account.currency,
      kind: row.kind,
    });
  }

  if (values.length > 0) {
    await db.insert(contributions).values(values);
    created = values.length;
  }

  return { created, skipped };
}
