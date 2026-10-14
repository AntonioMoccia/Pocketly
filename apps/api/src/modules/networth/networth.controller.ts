/**
 * Patrimonio: totale corrente, storico degli snapshot e snapshot a mano.
 */
import { Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  currentNetWorth,
  netWorthHistory,
  previousSnapshot,
  saveNetWorthSnapshot,
} from "@api/data/networth";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { currency, isoDate } from "../../common/schemas";

const monthsSchema = z.coerce.number().int().min(1).max(600).optional();

@Controller("networth")
export class NetWorthController {
  /**
   * La valuta di riferimento si puo scegliere (la dashboard mostra il totale
   * nella valuta preferita); senza indicazioni vale quella dell'household.
   */
  @Get("current")
  current(
    @Ctx() ctx: RequestContext,
    @Query("baseCurrency") baseCurrency?: string,
    @Query("asOf") asOf?: string,
  ) {
    return currentNetWorth(
      ctx.household.id,
      baseCurrency ? currency.parse(baseCurrency).toUpperCase() : ctx.household.baseCurrency,
      asOf ? isoDate.parse(asOf) : undefined,
    );
  }

  @Get("history")
  history(@Ctx() ctx: RequestContext, @Query("months") months?: string) {
    return netWorthHistory(ctx.household.id, monthsSchema.parse(months));
  }

  /** Snapshot piu recente prima di una data; `null` se non ce n'e. */
  @Get("previous")
  previous(@Ctx() ctx: RequestContext, @Query("before") before?: string) {
    return previousSnapshot(ctx.household.id, isoDate.parse(before));
  }

  /** Snapshot del giorno, sempre nella valuta base dell'household. */
  @Writable()
  @Post("snapshot")
  snapshot(@Ctx() ctx: RequestContext) {
    return saveNetWorthSnapshot(ctx.household.id, ctx.household.baseCurrency);
  }
}
