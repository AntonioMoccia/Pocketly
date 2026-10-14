/**
 * Buste: letture del mese, spostamenti, copertura degli sforamenti e
 * chiusura del mese.
 *
 * Il calcolo resta in `src/server/envelopes`: qui si valida e si passa
 * l'household della sessione, mai uno arrivato dal client.
 */
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import {
  accountConsistency,
  closeMonth,
  coverageFor,
  deleteEnvelope,
  envelopeTransactions,
  getEnvelope,
  isMonthClosed,
  listEnvelopes,
  moveBetweenEnvelopes,
  saveEnvelope,
  setEnvelopeArchived,
} from "@api/data/envelopes";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, isoDate, nullableId } from "../../common/schemas";

const envelopeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["real", "virtual"]),
  accountId: z.string().trim().min(1),
  leftoverPolicy: z.enum(["accumulate", "sweep"]),
  sweepToEnvelopeId: nullableId,
  color: z.number().int().min(0).max(6),
});

const monthQuery = z.object({ month: isoDate.optional() });

const listQuery = monthQuery.extend({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

// Lo spostamento "leftover" lo scrive solo la chiusura del mese: dal client
// arrivano soltanto coperture di sforamenti e spostamenti a mano.
const moveSchema = z.object({
  fromEnvelopeId: z.string().trim().min(1),
  toEnvelopeId: z.string().trim().min(1),
  amountCents: cents.refine((value) => value > 0),
  reason: z.enum(["overspend", "manual"]),
  date: isoDate.optional(),
  note: z.string().trim().max(200).nullish(),
});

@Controller()
export class EnvelopesController {
  @Get("envelopes")
  list(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const { month, includeArchived } = listQuery.parse(query);
    return listEnvelopes(ctx.household.id, { month, includeArchived });
  }

  /** Prima di `envelopes/:id`, altrimenti "consistency" passerebbe per un id. */
  @Get("envelopes/consistency")
  consistency(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    return accountConsistency(ctx.household.id, monthQuery.parse(query).month);
  }

  @Get("envelopes/:id")
  async get(@Ctx() ctx: RequestContext, @Param("id") id: string, @Query() query: unknown) {
    const envelope = await getEnvelope(ctx.household.id, id, monthQuery.parse(query).month);
    if (!envelope) throw new NotFoundException({ code: "notFound" });
    return envelope;
  }

  @Get("envelopes/:id/coverage")
  coverage(@Ctx() ctx: RequestContext, @Param("id") id: string, @Query() query: unknown) {
    return coverageFor(ctx.household.id, id, monthQuery.parse(query).month);
  }

  @Get("envelopes/:id/transactions")
  transactions(@Ctx() ctx: RequestContext, @Param("id") id: string, @Query() query: unknown) {
    const { month } = z.object({ month: isoDate }).parse(query);
    return envelopeTransactions(ctx.household.id, id, month);
  }

  @Writable()
  @Post("envelopes")
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const id = await saveEnvelope(ctx.household.id, envelopeSchema.parse(body));
    return { id };
  }

  @Writable()
  @Put("envelopes/:id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const saved = await saveEnvelope(ctx.household.id, envelopeSchema.parse(body), id);
    return { id: saved };
  }

  @Writable()
  @Post("envelopes/:id/archive")
  async archive(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { archived } = z.object({ archived: z.boolean() }).parse(body);
    await setEnvelopeArchived(ctx.household.id, id, archived);
  }

  @Writable()
  @Delete("envelopes/:id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteEnvelope(ctx.household.id, id);
  }

  /**
   * Sposta assegnato da una busta all'altra. Se le buste stanno su conti
   * diversi la risposta porta anche il giroconto da fare.
   */
  @Writable()
  @Post("envelope-moves")
  move(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    return moveBetweenEnvelopes(ctx.household.id, moveSchema.parse(body));
  }

  @Get("month-closes/:month")
  async closed(@Ctx() ctx: RequestContext, @Param("month") month: string) {
    return { closed: await isMonthClosed(ctx.household.id, isoDate.parse(month)) };
  }

  /** Chiusura del mese: sposta davvero gli avanzi, quindi la decide l'owner. */
  @Writable()
  @Post("month-closes")
  close(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { month } = z.object({ month: isoDate }).parse(body);
    return closeMonth(ctx.household.id, month, ctx.user.id);
  }
}
