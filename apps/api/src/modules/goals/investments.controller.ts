/**
 * Investimenti e versamenti (F1.10). Il valore attuale e il saldo del conto;
 * qui vivono solo i versamenti, che servono a calcolare quanto si e investito.
 */
import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { addContribution, deleteContribution, listInvestments } from "@api/data/investments";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, isoDate } from "../../common/schemas";

const contributionSchema = z.object({
  accountId: z.string().trim().min(1),
  date: isoDate,
  amountCents: cents.refine((value) => value > 0),
  kind: z.enum(["deposit", "withdrawal"]),
  note: z.string().trim().max(500).nullish().transform((value) => value || null),
});

@Controller("investments")
export class InvestmentsController {
  @Get()
  list(@Ctx() ctx: RequestContext) {
    return listInvestments(ctx.household.id);
  }

  @Writable()
  @Post("contributions")
  async addContribution(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const id = await addContribution(ctx.household.id, contributionSchema.parse(body));
    return { id };
  }

  @Writable()
  @Delete("contributions/:id")
  async removeContribution(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteContribution(ctx.household.id, id);
  }
}
