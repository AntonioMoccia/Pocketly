/**
 * Giorni di paga letti dall'API. Le date di chiusura e creazione arrivano come
 * stringhe nel JSON: qui tornano `Date`, cosi le pagine vedono le stesse forme
 * del livello dati.
 */
import { api } from "@/lib/api";
import type { listIncomes as serverListIncomes, Payday, PaydayAllocation } from "@api/data/payday";

export type { Payday, PaydayAllocation };

export type IncomeSummary = Awaited<ReturnType<typeof serverListIncomes>>[number];

type Wire<T> = Omit<T, "closedAt" | "createdAt"> & { closedAt: string | null; createdAt: string };

function revivePayday(row: Wire<Payday>): Payday {
  return {
    ...row,
    closedAt: row.closedAt ? new Date(row.closedAt) : null,
    createdAt: new Date(row.createdAt),
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "status" in error && error.status === 404;
}

/** Entrata aperta piu recente, o `null`: l'API risponde senza corpo. */
export async function openPayday(): Promise<Payday | null> {
  const row = await api.get<Wire<Payday> | undefined>("/payday/open");
  return row ? revivePayday(row) : null;
}

export async function getPayday(incomeId: string): Promise<Payday | null> {
  try {
    return revivePayday(await api.get<Wire<Payday>>(`/payday/${encodeURIComponent(incomeId)}`));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function listIncomes(limit?: number): Promise<IncomeSummary[]> {
  const rows = await api.get<(Omit<IncomeSummary, "closedAt"> & { closedAt: string | null })[]>(
    "/payday/incomes",
    { limit },
  );
  return rows.map((row) => ({ ...row, closedAt: row.closedAt ? new Date(row.closedAt) : null }));
}
