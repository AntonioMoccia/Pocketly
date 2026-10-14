/**
 * Import di un estratto conto (F1.5.1).
 *
 * L'anteprima non scrive nulla: legge il file, applica le regole e dice cosa
 * succederebbe. La conferma scrive in una transazione sola, saltando le righe
 * gia presenti grazie all'impronta.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@api/db";
import { accounts, importBatches, importProfiles, transactions } from "@api/db/schema";
import {
  fingerprint,
  guessColumnMap,
  mapRows,
  parseCsv,
  type ColumnMap,
  type ParsedRow,
  type RowError,
} from "@pocketly/domain/csv";
import { applyRules } from "@pocketly/domain/rules";
import { DomainError } from "./accounts";
import { applyRulesToPending, deleteTransactions, detectTransfers, listRules } from "./transactions";

export type PreviewRow = ParsedRow & {
  fingerprint: string;
  duplicate: boolean;
  categoryId: string | null;
  envelopeId: string | null;
};

export type ImportPreview = {
  headers: string[];
  delimiter: string;
  columnMap: Partial<ColumnMap>;
  rows: PreviewRow[];
  errors: RowError[];
  counts: {
    total: number;
    duplicates: number;
    fresh: number;
    categorized: number;
    uncategorized: number;
  };
};

/** Legge il file e dice cosa succederebbe, senza scrivere niente. */
export async function previewImport(
  householdId: string,
  accountId: string,
  text: string,
  options: { columnMap?: Partial<ColumnMap>; dateFormat?: string; delimiter?: string } = {},
): Promise<ImportPreview> {
  const [account] = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
    .limit(1);
  if (!account) throw new DomainError("accountNotFound");

  const table = parseCsv(text, options.delimiter);
  const guessed = guessColumnMap(table.headers);
  const columnMap = { ...guessed, ...options.columnMap } as ColumnMap;

  if (!columnMap.date || !columnMap.description) {
    throw new DomainError("importColumns");
  }

  const { rows, errors } = mapRows(table, columnMap, {
    currency: account.currency.trim(),
    dateFormat: options.dateFormat,
  });

  const prints = rows.map((row) =>
    fingerprint({
      date: row.date,
      amountCents: row.amountCents,
      description: row.description,
      counterparty: row.counterparty,
    }),
  );

  const existing =
    prints.length > 0
      ? await db
          .select({ providerRef: transactions.providerRef })
          .from(transactions)
          .where(
            and(eq(transactions.accountId, accountId), inArray(transactions.providerRef, prints)),
          )
      : [];
  const known = new Set(existing.map((row) => row.providerRef));

  const rules = await listRules(householdId);
  // Impronte viste nello stesso file: un estratto conto puo contenere due volte
  // la stessa riga, e il vincolo di unicita la rifiuterebbe a meta scrittura.
  const seen = new Set<string>();

  const preview: PreviewRow[] = rows.map((row, index) => {
    const print = prints[index]!;
    const duplicate = known.has(print) || seen.has(print);
    seen.add(print);
    const outcome = applyRules(rules, {
      description: row.description,
      counterparty: row.counterparty,
      amountCents: row.amountCents,
    });
    return {
      ...row,
      fingerprint: print,
      duplicate,
      categoryId: outcome.categoryId,
      envelopeId: outcome.envelopeId,
    };
  });

  const fresh = preview.filter((row) => !row.duplicate);
  return {
    headers: table.headers,
    delimiter: table.delimiter,
    columnMap,
    rows: preview,
    errors,
    counts: {
      total: preview.length,
      duplicates: preview.length - fresh.length,
      fresh: fresh.length,
      categorized: fresh.filter((row) => row.categoryId !== null).length,
      uncategorized: fresh.filter((row) => row.categoryId === null).length,
    },
  };
}

export type ImportResult = {
  batchId: string;
  imported: number;
  skipped: number;
  transfersDetected: number;
  categorized: number;
};

/**
 * Scrive i movimenti nuovi. `onConflictDoNothing` sull'impronta e la seconda
 * barriera contro i doppioni: anche due import lanciati insieme non li creano.
 */
export async function commitImport(
  householdId: string,
  accountId: string,
  filename: string,
  preview: ImportPreview,
  userId: string,
): Promise<ImportResult> {
  const [account] = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
    .limit(1);
  if (!account) throw new DomainError("accountNotFound");

  const fresh = preview.rows.filter((row) => !row.duplicate);

  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        householdId,
        accountId,
        filename,
        rowCount: preview.rows.length,
        importedCount: fresh.length,
        skippedCount: preview.rows.length - fresh.length,
        createdBy: userId,
      })
      .returning({ id: importBatches.id });
    if (!batch) throw new DomainError("validation");

    if (fresh.length > 0) {
      await tx
        .insert(transactions)
        .values(
          fresh.map((row) => ({
            householdId,
            accountId,
            bookedDate: row.date,
            amount: row.amountCents,
            currency: (row.currency ?? account.currency).trim().toUpperCase(),
            description: row.description,
            counterparty: row.counterparty,
            providerRef: row.fingerprint,
            categoryId: row.categoryId,
            envelopeId: row.envelopeId,
            kind: (row.amountCents >= 0 ? "income" : "expense") as "income" | "expense",
            importBatchId: batch.id,
          })),
        )
        .onConflictDoNothing({
          target: [transactions.accountId, transactions.providerRef],
        });
    }

    return batch.id;
  });

  const transfersDetected = await detectTransfers(householdId);
  const categorized = await applyRulesToPending(householdId);

  return {
    batchId,
    imported: fresh.length,
    skipped: preview.rows.length - fresh.length,
    transfersDetected,
    categorized,
  };
}

/**
 * Annulla un import: utile quando il file era quello sbagliato. I movimenti
 * del file spariscono e l'import esce dall'elenco.
 */
export async function undoImport(householdId: string, batchId: string): Promise<number> {
  const deleted = await deleteTransactions(householdId, { batchId });
  const batch = await db
    .delete(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.householdId, householdId)))
    .returning({ id: importBatches.id });
  if (batch.length === 0) throw new DomainError("notFound");
  return deleted;
}

/** Import piu recenti per primi, con il conto e quanti movimenti restano. */
export async function listImportBatches(householdId: string, limit = 10) {
  return db
    .select({
      id: importBatches.id,
      filename: importBatches.filename,
      importedCount: importBatches.importedCount,
      skippedCount: importBatches.skippedCount,
      createdAt: importBatches.createdAt,
      accountName: accounts.name,
      remainingCount: sql<number>`(
        select count(*)::int from ${transactions}
        where ${transactions.importBatchId} = ${importBatches.id}
      )`,
    })
    .from(importBatches)
    .leftJoin(accounts, eq(accounts.id, importBatches.accountId))
    .where(eq(importBatches.householdId, householdId))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit);
}

export async function saveImportProfile(
  householdId: string,
  input: {
    name: string;
    institutionId: string | null;
    columnMap: Record<string, string>;
    dateFormat: string;
    delimiter: string;
  },
): Promise<string> {
  const [created] = await db
    .insert(importProfiles)
    .values({
      householdId,
      name: input.name.trim(),
      institutionId: input.institutionId,
      columnMap: input.columnMap,
      dateFormat: input.dateFormat,
      delimiter: input.delimiter,
    })
    .returning({ id: importProfiles.id });
  if (!created) throw new DomainError("validation");
  return created.id;
}

export async function listImportProfiles(householdId: string) {
  return db
    .select()
    .from(importProfiles)
    .where(eq(importProfiles.householdId, householdId));
}
