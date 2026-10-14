/**
 * Categorie: albero modificabile, con busta predefinita per categoria.
 */
import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { deleteCategory, listCategories, saveCategory } from "@api/data/categories";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { nullableId } from "../../common/schemas";

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["expense", "income", "transfer"]),
  parentId: nullableId,
  defaultEnvelopeId: nullableId,
});

@Controller("categories")
export class CategoriesController {
  @Get()
  list(@Ctx() ctx: RequestContext) {
    return listCategories(ctx.household.id);
  }

  @Writable()
  @Post()
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    return { id: await saveCategory(ctx.household.id, categorySchema.parse(body)) };
  }

  @Writable()
  @Put(":id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    return { id: await saveCategory(ctx.household.id, categorySchema.parse(body), id) };
  }

  @Writable()
  @Delete(":id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteCategory(ctx.household.id, id);
  }
}
