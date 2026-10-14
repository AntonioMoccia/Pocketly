/**
 * Tassi di cambio letti dall'API (feed BCE salvato nel database).
 */
import { api } from "@/lib/api";
import type { RateMap } from "@pocketly/domain/fx";

export function ratesForDate(date: string): Promise<RateMap> {
  return api.get<RateMap>("/fx/rates", { date });
}

export function latestRates(): Promise<{ date: string | null; rates: RateMap }> {
  return api.get<{ date: string | null; rates: RateMap }>("/fx/latest");
}
