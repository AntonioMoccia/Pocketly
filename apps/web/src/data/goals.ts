/**
 * Obiettivi letti dall'API, con l'avanzamento gia calcolato.
 */
import { api } from "@/lib/api";
import type { GoalInput, GoalWithProgress } from "@api/data/goals";

export type { GoalInput, GoalWithProgress };

/**
 * `baseCurrency` resta nella firma per somiglianza con il livello dati, ma
 * l'API usa quella dell'household della sessione.
 */
export function listGoals(
  _baseCurrency?: string,
  options: { includeArchived?: boolean } = {},
): Promise<GoalWithProgress[]> {
  return api.get<GoalWithProgress[]>("/goals", { includeArchived: options.includeArchived });
}
