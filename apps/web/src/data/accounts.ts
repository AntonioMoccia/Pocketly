/**
 * Conti, Pocket e istituti letti dall'API. I tipi vengono dal livello dati
 * dell'API: il frontend vede le stesse forme senza toccare il database.
 */
import { api } from "@/lib/api";
import type { AccountWithBalance } from "@api/data/accounts";

export type { AccountWithBalance };

export type Institution = { id: string; name: string; country: string | null; provider: string };

export type BalanceRow = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  source: string;
  note: string | null;
};

export function listAccounts(options: { asOf?: string; includeArchived?: boolean } = {}) {
  return api.get<AccountWithBalance[]>("/accounts", options);
}

export async function getAccount(id: string): Promise<AccountWithBalance | null> {
  try {
    return await api.get<AccountWithBalance>(`/accounts/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export function accountHistory(id: string) {
  return api.get<BalanceRow[]>(`/accounts/${encodeURIComponent(id)}/history`);
}

export function listInstitutions() {
  return api.get<Institution[]>("/institutions");
}
