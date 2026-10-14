/**
 * Conti di investimento con versamenti e riepilogo, letti dall'API.
 */
import { api } from "@/lib/api";
import type { ContributionInput, InvestmentAccount } from "@api/data/investments";

export type { ContributionInput, InvestmentAccount };

export function listInvestments(): Promise<InvestmentAccount[]> {
  return api.get<InvestmentAccount[]>("/investments");
}
