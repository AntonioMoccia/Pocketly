/**
 * Giorno di paga ed entrate irregolari.
 *
 * Il wizard salva ogni passo qui: lo stato vive nel database, cosi un'entrata
 * lasciata a meta si riprende da un altro dispositivo.
 */
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import {
  closePayday,
  createIncome,
  deleteIncome,
  getPayday,
  listIncomes,
  openPayday,
  reopenPayday,
  replaceAllocations,
  setAllAllocationsDone,
  setAllocationDone,
  updateIncome,
} from "@api/data/payday";
import { templateForKind } from "@api/data/templates";
import { INCOME_KINDS } from "@pocketly/domain/income";
import { saveNetWorthSnapshot } from "@api/data/networth";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, currency, isoDate, nullableId } from "../../common/schemas";

const incomeSchema = z.object({
  date: isoDate,
  amount: cents.refine((value) => value > 0),
  currency,
  kind: z.enum(INCOME_KINDS),
  accountId: nullableId,
  templateId: nullableId,
  note: z.string().trim().max(500).nullish(),
  /** Movimento in entrata da cui parte la ripartizione. */
  transactionId: nullableId.optional(),
  /**
   * Ripartizione rapida: applica il modello, spunta le righe e chiude, senza
   * passare dal wizard. Pensata per le entrate piccole, come una vendita.
   */
  quick: z.boolean().optional(),
  /** "Nessun modello" scelto a mano: niente modello automatico. */
  skipTemplate: z.boolean().optional(),
});

const lineSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().max(80),
  kind: z.enum(["fixed", "percent", "remainder"]),
  envelopeId: nullableId,
  amountCents: cents,
  percentBps: z.number().int(),
  percentBasis: z.enum(["gross", "remaining"]),
  priority: z.number().int(),
});

const allocationsSchema = z.object({
  /** Importo corretto dell'entrata; assente se l'utente non l'ha toccato. */
  amount: cents.nullish(),
  lines: z.array(lineSchema),
});

const doneSchema = z.object({ done: z.boolean() });

const allocationDoneSchema = doneSchema.extend({ actualCents: cents.nullish() });

const limitSchema = z.coerce.number().int().min(1).max(500).optional();

@Controller("payday")
export class PaydayController {
  // Le rotte fisse vanno dichiarate prima di `:id`, che altrimenti le cattura.
  @Get("open")
  open(@Ctx() ctx: RequestContext) {
    return openPayday(ctx.household.id);
  }

  @Get("incomes")
  incomes(@Ctx() ctx: RequestContext, @Query("limit") limit?: string) {
    return listIncomes(ctx.household.id, limitSchema.parse(limit));
  }

  @Get(":id")
  async get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    const payday = await getPayday(ctx.household.id, id);
    if (!payday) throw new NotFoundException({ code: "notFound" });
    return payday;
  }

  @Writable()
  @Post()
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const parsed = incomeSchema.parse(body);

    // Senza modello scelto si applica quello del tipo di entrata, o il
    // predefinito: il caso comune non deve richiedere una scelta.
    const templateId = parsed.skipTemplate
      ? null
      : (parsed.templateId ?? (await templateForKind(ctx.household.id, parsed.kind))?.id ?? null);

    const id = await createIncome(
      ctx.household.id,
      {
        date: parsed.date,
        amount: parsed.amount,
        currency: parsed.currency,
        kind: parsed.kind,
        accountId: parsed.accountId,
        templateId,
        note: parsed.note ?? null,
        transactionId: parsed.transactionId ?? null,
      },
      ctx.user.id,
    );

    // La rapida chiude solo se il modello copre tutto l'importo: altrimenti
    // si apre il wizard, dove si vede cosa manca.
    if (parsed.quick) {
      const payday = await getPayday(ctx.household.id, id);
      if (payday && payday.allocations.length > 0 && payday.plan.unassignedCents === 0) {
        await setAllAllocationsDone(ctx.household.id, id, true);
        await closePayday(ctx.household.id, id);
        await saveNetWorthSnapshot(ctx.household.id, ctx.household.baseCurrency);
        return { id, closed: true };
      }
    }
    return { id, closed: false };
  }

  /** Importo e righe si salvano insieme: il piano dipende da entrambi. */
  @Writable()
  @Put(":id/allocations")
  async saveAllocations(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { amount, lines } = allocationsSchema.parse(body);
    const payday = await getPayday(ctx.household.id, id);
    if (!payday) throw new NotFoundException({ code: "notFound" });

    if (amount !== null && amount !== undefined && amount !== payday.amountCents) {
      await updateIncome(ctx.household.id, id, { amount });
    }
    await replaceAllocations(ctx.household.id, id, lines);
    return { id };
  }

  @Writable()
  @Post("allocations/:allocationId/done")
  async allocationDone(
    @Ctx() ctx: RequestContext,
    @Param("allocationId") allocationId: string,
    @Body() body: unknown,
  ) {
    const { done, actualCents } = allocationDoneSchema.parse(body);
    // Senza importo effettivo si lascia quello gia salvato.
    await setAllocationDone(ctx.household.id, allocationId, done, actualCents ?? undefined);
  }

  @Writable()
  @Post(":id/done-all")
  async allDone(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { done } = doneSchema.parse(body);
    await setAllAllocationsDone(ctx.household.id, id, done);
  }

  @Writable()
  @Post(":id/close")
  async close(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await closePayday(ctx.household.id, id);
    // Lo storico del patrimonio si genera senza azioni manuali (F1.12).
    await saveNetWorthSnapshot(ctx.household.id, ctx.household.baseCurrency);
  }

  @Writable()
  @Post(":id/reopen")
  async reopen(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await reopenPayday(ctx.household.id, id);
  }

  @Writable()
  @Delete(":id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteIncome(ctx.household.id, id);
  }
}
