/**
 * Import delle tabelle esportate da Notion (F1.15), in due passi: anteprima,
 * che non scrive nulla, e conferma.
 *
 * Il CSV arriva come testo grezzo: riconoscere colonne e importi e lavoro del
 * livello dati. L'anteprima torna al client e ne rientra alla conferma, quindi
 * alla conferma va ricontrollata come qualsiasi altro input.
 */
import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { ACCOUNT_CATEGORIES } from "@pocketly/domain/networth";
import { commitNotion, previewNotion } from "@api/data/notion-import";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, currency, isoDate } from "../../common/schemas";

const previewSchema = z.object({
  kind: z.enum(["accounts", "contributions"]),
  // Lo stesso limite che il frontend applica al file caricato.
  text: z.string().max(5_000_000),
});

const name = z.string().trim().min(1).max(200);

const notionPreviewSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("accounts"),
    rows: z.array(
      z.object({
        name,
        institution: z.string().trim().nullable(),
        parent: z.string().trim().nullable(),
        currency,
        category: z.enum(ACCOUNT_CATEGORIES),
        liquid: z.boolean(),
        balanceCents: cents.nullable(),
        duplicate: z.boolean(),
      }),
    ),
    errors: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("contributions"),
    rows: z.array(
      z.object({
        accountName: name,
        date: isoDate,
        amountCents: cents,
        kind: z.enum(["deposit", "withdrawal"]),
        unknownAccount: z.boolean(),
      }),
    ),
    errors: z.array(z.string()),
  }),
]);

@Controller("notion")
export class NotionController {
  @Writable()
  @Post("preview")
  preview(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { kind, text } = previewSchema.parse(body);
    return previewNotion(ctx.household.id, kind, text, ctx.household.baseCurrency);
  }

  @Writable()
  @Post("commit")
  commit(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { preview } = z.object({ preview: notionPreviewSchema }).parse(body);
    return commitNotion(ctx.household.id, preview, {
      userId: ctx.user.id,
      baseCurrency: ctx.household.baseCurrency,
    });
  }
}
