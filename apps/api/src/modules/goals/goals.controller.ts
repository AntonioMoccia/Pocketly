/**
 * Obiettivi (F1.9).
 *
 * L'avanzamento si ricalcola a ogni lettura dai saldi dei conti collegati: qui
 * si leggono e si scrivono solo le definizioni.
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { deleteGoal, listGoals, saveGoal, setGoalStatus } from "@api/data/goals";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, currency, isoDate } from "../../common/schemas";

const status = z.enum(["active", "reached", "paused", "archived"]);

const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetCents: cents.refine((value) => value >= 0),
  currency,
  deadline: isoDate.nullish().transform((value) => value ?? null),
  status,
  note: z.string().trim().max(500).nullish().transform((value) => value ?? null),
  accountIds: z.array(z.string().min(1)).default([]),
});

@Controller("goals")
export class GoalsController {
  @Get()
  list(@Ctx() ctx: RequestContext, @Query("includeArchived") includeArchived?: string) {
    return listGoals(ctx.household.id, ctx.household.baseCurrency, {
      includeArchived: includeArchived === "true",
    });
  }

  @Writable()
  @Post()
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const id = await saveGoal(ctx.household.id, goalSchema.parse(body));
    return { id };
  }

  @Writable()
  @Put(":id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    await saveGoal(ctx.household.id, goalSchema.parse(body), id);
    return { id };
  }

  @Writable()
  @Post(":id/status")
  async setStatus(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const parsed = z.object({ status }).parse(body);
    await setGoalStatus(ctx.household.id, id, parsed.status);
  }

  @Writable()
  @Delete(":id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteGoal(ctx.household.id, id);
  }
}
