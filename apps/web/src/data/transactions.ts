/**
 * Movimenti, regole e giroconti letti dall'API.
 */
import { api } from "@/lib/api";
import type { Rule } from "@pocketly/domain/rules";
import type {
  TransactionFilter,
  TransactionRow,
  listTransferTodos as serverListTransferTodos,
  ruleSuggestionFor as serverRuleSuggestionFor,
} from "@api/data/transactions";

export type { Rule, TransactionFilter, TransactionRow };

export type RuleSuggestion = Awaited<ReturnType<typeof serverRuleSuggestionFor>>;

// Le date viaggiano in JSON come stringhe ISO: il tipo lo dice, cosi nessuno
// chiama `.getTime()` su una stringa.
export type TransferTodo = Omit<
  Awaited<ReturnType<typeof serverListTransferTodos>>[number],
  "createdAt"
> & { createdAt: string };

export function listTransactions(filter: TransactionFilter = {}) {
  return api.get<TransactionRow[]>("/transactions", filter);
}

export async function getTransaction(transactionId: string): Promise<TransactionRow | null> {
  try {
    return await api.get<TransactionRow>(`/transactions/${encodeURIComponent(transactionId)}`);
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export async function uncategorizedCount(month?: string): Promise<number> {
  const { count } = await api.get<{ count: number }>("/transactions/uncategorized-count", { month });
  return count;
}

export function categorizationRate(month: string) {
  return api.get<{ total: number; categorized: number; ratio: number }>(
    "/transactions/categorization-rate",
    { month },
  );
}

export async function ruleSuggestionFor(
  transactionId: string,
  categoryId: string,
  envelopeId: string | null,
): Promise<RuleSuggestion> {
  const { suggestion } = await api.get<{ suggestion: RuleSuggestion }>(
    `/transactions/${encodeURIComponent(transactionId)}/rule-suggestion`,
    { categoryId, envelopeId },
  );
  return suggestion;
}

export function listRules() {
  return api.get<Rule[]>("/rules");
}

export function listTransferTodos(status: "todo" | "done" = "todo") {
  return api.get<TransferTodo[]>("/transfer-todos", { status });
}
