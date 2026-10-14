/**
 * Versamenti e valore degli investimenti (F1.10).
 *
 * In questa fase il valore attuale e il saldo del conto, inserito a mano: cosi
 * entra nel patrimonio come ogni altro conto, senza una tabella parallela. I
 * prezzi automatici degli ETF arriveranno in fase 3 sostituendo solo la fonte
 * di quel saldo.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@api/db";
import { contributions } from "@api/db/schema";
import { summarizeInvestment, type InvestmentSummary } from "@pocketly/domain/goals";
import { DomainError, listAccounts, type AccountWithBalance } from "./accounts";

export type InvestmentAccount = {
  account: AccountWithBalance;
  summary: InvestmentSummary;
  contributions: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    kind: "deposit" | "withdrawal";
    note: string | null;
  }[];
};

/** Conti di categoria "investimenti" o "capitale garantito", con i versamenti. */
export async function listInvestments(householdId: string): Promise<InvestmentAccount[]> {
  // Solo i conti principali: il loro saldo e gia la somma dei Pocket, che
  // elencati a parte comparirebbero due volte.
  const accounts = (await listAccounts(householdId)).filter(
    (account) =>
      !account.parentId &&
      (account.category === "investments" || account.category === "guaranteed_capital"),
  );
  if (accounts.length === 0) return [];

  const rows = await db
    .select()
    .from(contributions)
    .where(
      and(
        eq(contributions.householdId, householdId),
        inArray(
          contributions.accountId,
          accounts.map((account) => account.id),
        ),
      ),
    )
    .orderBy(desc(contributions.date), desc(contributions.createdAt));

  return accounts.map((account) => {
    const own = rows.filter((row) => row.accountId === account.id);
    return {
      account,
      summary: summarizeInvestment(
        own.map((row) => ({ date: row.date, amountCents: row.amount, kind: row.kind })),
        account.balanceDate ? account.balanceCents : null,
      ),
      contributions: own.map((row) => ({
        id: row.id,
        date: row.date,
        amount: row.amount,
        currency: row.currency.trim(),
        kind: row.kind,
        note: row.note,
      })),
    };
  });
}

export type ContributionInput = {
  accountId: string;
  date: string;
  amountCents: number;
  kind: "deposit" | "withdrawal";
  note: string | null;
};

export async function addContribution(
  householdId: string,
  input: ContributionInput,
): Promise<string> {
  const accounts = await listAccounts(householdId, { includeArchived: true });
  const account = accounts.find((row) => row.id === input.accountId);
  if (!account) throw new DomainError("accountNotFound");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    throw new DomainError("validation");
  }

  const [created] = await db
    .insert(contributions)
    .values({
      householdId,
      accountId: input.accountId,
      date: input.date,
      amount: input.amountCents,
      currency: account.currency,
      kind: input.kind,
      note: input.note?.trim() || null,
    })
    .returning({ id: contributions.id });
  if (!created) throw new DomainError("validation");
  return created.id;
}

export async function deleteContribution(
  householdId: string,
  contributionId: string,
): Promise<void> {
  const result = await db
    .delete(contributions)
    .where(
      and(eq(contributions.id, contributionId), eq(contributions.householdId, householdId)),
    )
    .returning({ id: contributions.id });
  if (result.length === 0) throw new DomainError("notFound");
}

export async function listContributions(householdId: string, accountId: string) {
  return db
    .select()
    .from(contributions)
    .where(
      and(eq(contributions.householdId, householdId), eq(contributions.accountId, accountId)),
    )
    .orderBy(asc(contributions.date));
}
