/**
 * Tassi di cambio BCE. Sono dati dell'istanza, non dell'household: la lettura
 * chiede comunque un household, come ogni altro endpoint dell'app.
 */
import { Controller, Get, Post, Query } from "@nestjs/common";
import { latestRates, ratesForDate, refreshRates } from "@api/data/fx";
import { Writable } from "../../common/guards";
import { isoDate } from "../../common/schemas";

@Controller("fx")
export class FxController {
  /** Tassi validi a una data, risalendo all'ultimo giorno pubblicato. */
  @Get("rates")
  rates(@Query("date") date?: string) {
    return ratesForDate(isoDate.parse(date));
  }

  @Get("latest")
  latest() {
    return latestRates();
  }

  /** Aggiornamento a mano dalla BCE; di solito lo fa il job giornaliero. */
  @Writable()
  @Post("refresh")
  refresh() {
    return refreshRates();
  }
}
