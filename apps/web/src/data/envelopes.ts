/**
 * Buste lette dall'API: stato del mese, dettaglio, coperture e chiusura.
 */
import { api } from "@/lib/api";
import type {
  AccountCheck,
  EnvelopeRow,
  MonthCloseResult,
  coverageFor as serverCoverageFor,
  envelopeTransactions as serverEnvelopeTransactions,
} from "@api/data/envelopes";

export type { AccountCheck, EnvelopeRow, MonthCloseResult };

export type Coverage = Awaited<ReturnType<typeof serverCoverageFor>>;
export type EnvelopeTransaction = Awaited<ReturnType<typeof serverEnvelopeTransactions>>[number];

export function listEnvelopes(options: { month?: string; includeArchived?: boolean } = {}) {
  return api.get<EnvelopeRow[]>("/envelopes", options);
}

export async function getEnvelope(envelopeId: string, month?: string): Promise<EnvelopeRow | null> {
  try {
    return await api.get<EnvelopeRow>(`/envelopes/${encodeURIComponent(envelopeId)}`, { month });
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export function coverageFor(envelopeId: string, month?: string) {
  return api.get<Coverage>(`/envelopes/${encodeURIComponent(envelopeId)}/coverage`, { month });
}

export function envelopeTransactions(envelopeId: string, month: string) {
  return api.get<EnvelopeTransaction[]>(
    `/envelopes/${encodeURIComponent(envelopeId)}/transactions`,
    { month },
  );
}

export function accountConsistency(month?: string) {
  return api.get<AccountCheck[]>("/envelopes/consistency", { month });
}

export async function isMonthClosed(month: string): Promise<boolean> {
  const { closed } = await api.get<{ closed: boolean }>(`/month-closes/${encodeURIComponent(month)}`);
  return closed;
}
