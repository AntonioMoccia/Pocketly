/**
 * Movimenti: lettura con filtri, categorizzazione, regole e giroconti.
 *
 * La categorizzazione con "crea regola" era una sequenza di chiamate nella
 * Server Action: ora vive qui, cosi il client fa una richiesta sola.
 */
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  applyRulesToPending,
  categorizationRate,
  categorizeTransaction,
  createRule,
  deleteRule,
  deleteTransaction,
  detectTransfers,
  getTransaction,
  listRules,
  listTransactions,
  listTransferTodos,
  ruleSuggestionFor,
  setTransactionIgnored,
  setTransferTodoDone,
  uncategorizedCount,
} from "@api/data/transactions";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { isoDate, nullableId } from "../../common/schemas";

const kind = z.enum(["expense", "income", "transfer"]);
const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

const listQuery = z.object({
  month: isoDate.optional(),
  accountId: z.string().trim().min(1).optional(),
  envelopeId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  uncategorized: flag,
  kind: kind.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const monthQuery = z.object({ month: isoDate.optional() });

// `envelopeId` assente significa "lascia decidere alla categoria", `null`
// significa "nessuna busta": sono due richieste diverse, vanno distinte.
const categorizeSchema = z.object({
  categoryId: nullableId,
  envelopeId: z.string().trim().nullable().optional().transform((value) =>
    value === undefined ? undefined : value ? value : null,
  ),
  createRule: z.boolean().optional(),
});

@Controller()
export class TransactionsController {
  @Get("transactions")
  list(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    return listTransactions(ctx.household.id, listQuery.parse(query));
  }

  @Get("transactions/uncategorized-count")
  async uncategorized(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    return { count: await uncategorizedCount(ctx.household.id, monthQuery.parse(query).month) };
  }

  @Get("transactions/categorization-rate")
  rate(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const { month } = z.object({ month: isoDate }).parse(query);
    return categorizationRate(ctx.household.id, month);
  }

  @Get("transactions/:id")
  async get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    const transaction = await getTransaction(ctx.household.id, id);
    if (!transaction) throw new NotFoundException({ code: "notFound" });
    return transaction;
  }

  /** Avvolta in un oggetto: un `null` nudo arriverebbe come corpo vuoto. */
  @Get("transactions/:id/rule-suggestion")
  async ruleSuggestion(@Ctx() ctx: RequestContext, @Param("id") id: string, @Query() query: unknown) {
    const { categoryId, envelopeId } = z
      .object({ categoryId: z.string().trim().min(1), envelopeId: nullableId })
      .parse(query);
    return { suggestion: await ruleSuggestionFor(ctx.household.id, id, categoryId, envelopeId) };
  }

  /**
   * Categorizza un movimento e, se richiesto, crea la regola proposta e la
   * applica subito agli altri movimenti in attesa.
   */
  @Writable()
  @Post("transactions/:id/categorize")
  async categorize(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { categoryId, envelopeId, createRule: wantsRule } = categorizeSchema.parse(body);
    await categorizeTransaction(ctx.household.id, id, { categoryId, envelopeId });

    let ruleId: string | null = null;
    if (wantsRule && categoryId) {
      const suggestion = await ruleSuggestionFor(ctx.household.id, id, categoryId, envelopeId ?? null);
      if (suggestion) {
        ruleId = await createRule(ctx.household.id, suggestion.rule);
        await applyRulesToPending(ctx.household.id, { onlyRuleId: ruleId });
      }
    }
    return { ruleId };
  }

  @Writable()
  @Delete("transactions/:id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteTransaction(ctx.household.id, id);
  }

  @Writable()
  @Post("transactions/:id/ignore")
  async ignore(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { ignored } = z.object({ ignored: z.boolean() }).parse(body);
    await setTransactionIgnored(ctx.household.id, id, ignored);
  }

  @Writable()
  @Post("transfers/detect")
  async detect(@Ctx() ctx: RequestContext) {
    return { detected: await detectTransfers(ctx.household.id) };
  }

  @Get("transfer-todos")
  todos(@Ctx() ctx: RequestContext, @Query() query: unknown) {
    const { status } = z.object({ status: z.enum(["todo", "done"]).default("todo") }).parse(query);
    return listTransferTodos(ctx.household.id, status);
  }

  @Writable()
  @Post("transfer-todos/:id/done")
  async settle(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { done } = z.object({ done: z.boolean() }).parse(body);
    await setTransferTodoDone(ctx.household.id, id, done);
  }

  @Get("rules")
  rules(@Ctx() ctx: RequestContext) {
    return listRules(ctx.household.id);
  }

  @Writable()
  @Delete("rules/:id")
  async removeRule(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteRule(ctx.household.id, id);
  }
}
