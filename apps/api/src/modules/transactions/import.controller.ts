/**
 * Import di un estratto conto CSV.
 *
 * Il file arriva come testo dentro il JSON: niente upload multipart e niente
 * copie su disco. L'anteprima torna al client, che la rimanda alla conferma.
 */
import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import {
  commitImport,
  listImportBatches,
  previewImport,
  undoImport,
  type ImportPreview,
} from "@api/data/import";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, isoDate } from "../../common/schemas";

const previewSchema = z.object({
  accountId: z.string().trim().min(1),
  // Stesso tetto della Server Action, che rifiuta i file oltre i 5 MB.
  text: z.string().min(1).max(5_000_000),
  delimiter: z.string().max(1).optional(),
  dateFormat: z.string().trim().max(20).optional(),
});

// La conferma scrive solo cio che serve: data, importo, testi, impronta e le
// scelte delle regole. Il resto dell'anteprima viene accettato cosi com'e.
const previewRowSchema = z.object({
  date: isoDate,
  description: z.string(),
  counterparty: z.string().nullable(),
  amountCents: cents,
  currency: z.string().trim().max(10).nullable(),
  raw: z.record(z.string(), z.string()),
  fingerprint: z.string().min(1),
  duplicate: z.boolean(),
  categoryId: z.string().nullable(),
  envelopeId: z.string().nullable(),
});

const commitSchema = z.object({
  accountId: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(255),
  preview: z.looseObject({ rows: z.array(previewRowSchema) }),
});

@Controller("imports")
export class ImportController {
  @Get()
  list(@Ctx() ctx: RequestContext) {
    return listImportBatches(ctx.household.id);
  }

  /** Annulla l'import: cancella i suoi movimenti. */
  @Writable()
  @Delete(":id")
  async undo(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return { deleted: await undoImport(ctx.household.id, id) };
  }

  @Writable()
  @Post("preview")
  preview(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { accountId, text, delimiter, dateFormat } = previewSchema.parse(body);
    return previewImport(ctx.household.id, accountId, text, {
      delimiter: delimiter || undefined,
      dateFormat: dateFormat || undefined,
    });
  }

  @Writable()
  @Post()
  commit(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { accountId, filename, preview } = commitSchema.parse(body);
    return commitImport(ctx.household.id, accountId, filename, preview as unknown as ImportPreview, ctx.user.id);
  }
}
