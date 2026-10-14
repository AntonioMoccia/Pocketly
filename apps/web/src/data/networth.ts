/**
 * Patrimonio letto dall'API: totale corrente e storico degli snapshot.
 */
import { api } from "@/lib/api";
import type { NetWorthNow, SnapshotRow } from "@api/data/networth";

export type { NetWorthNow, SnapshotRow };

export function currentNetWorth(baseCurrency: string, asOf?: string): Promise<NetWorthNow> {
  return api.get<NetWorthNow>("/networth/current", { baseCurrency, asOf });
}

export function netWorthHistory(months?: number): Promise<SnapshotRow[]> {
  return api.get<SnapshotRow[]>("/networth/history", { months });
}

/** Nessuno snapshot precedente: l'API risponde senza corpo. */
export async function previousSnapshot(before: string): Promise<SnapshotRow | null> {
  return (await api.get<SnapshotRow | undefined>("/networth/previous", { before })) ?? null;
}
