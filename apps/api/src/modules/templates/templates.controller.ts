/**
 * Modelli di ripartizione (F1.6). La coerenza delle righe (un solo "resto",
 * buste esistenti, valori non negativi) la controlla `saveTemplate`.
 */
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import {
  defaultTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  saveTemplate,
} from "@api/data/templates";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, nullableId } from "../../common/schemas";

const lineSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().max(120),
  kind: z.enum(["fixed", "percent", "remainder"]),
  envelopeId: nullableId,
  amountCents: cents,
  percentBps: z.number().int(),
  percentBasis: z.enum(["gross", "remaining"]),
  priority: z.number().int(),
});

const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isDefault: z.boolean(),
  lines: z.array(lineSchema),
});

@Controller("templates")
export class TemplatesController {
  @Get()
  list(@Ctx() ctx: RequestContext) {
    return listTemplates(ctx.household.id);
  }

  /** Il predefinito puo mancare: `null` e una risposta valida, non un 404. */
  @Get("default")
  async default(@Ctx() ctx: RequestContext) {
    return { template: await defaultTemplate(ctx.household.id) };
  }

  @Get(":id")
  async get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    const template = await getTemplate(ctx.household.id, id);
    if (!template) throw new NotFoundException({ code: "notFound" });
    return template;
  }

  @Writable()
  @Post()
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const id = await saveTemplate(ctx.household.id, templateSchema.parse(body));
    return { id };
  }

  @Writable()
  @Put(":id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    await saveTemplate(ctx.household.id, templateSchema.parse(body), id);
    return { id };
  }

  @Writable()
  @Post(":id/duplicate")
  async duplicate(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(body);
    return { id: await duplicateTemplate(ctx.household.id, id, name) };
  }

  @Writable()
  @Delete(":id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteTemplate(ctx.household.id, id);
  }
}
