/**
 * Conti, Pocket, istituti e saldi.
 *
 * Un conto principale nasce con il suo Pocket di default; i saldi si scrivono
 * solo sui Pocket e il saldo del conto e la loro somma.
 */
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { ACCOUNT_CATEGORIES } from "@pocketly/domain/networth";
import { today } from "@pocketly/domain/date";
import { DomainError } from "@pocketly/domain/errors";
import {
  accountHistory,
  createAccount,
  deleteAccount,
  findOrCreateInstitution,
  getAccount,
  listAccounts,
  listInstitutions,
  setArchived,
  updateAccount,
  type AccountInput,
} from "@api/data/accounts";
import { rateToBase, saveBalances } from "@api/data/balances";
import { ensureEnvelopeForAccount } from "@api/data/envelopes";
import { ratesForDate } from "@api/data/fx";
import { Ctx, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { cents, currency, isoDate, nullableId } from "../../common/schemas";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["checking", "savings", "pocket", "investment", "cash", "other"]),
  category: z.enum(ACCOUNT_CATEGORIES),
  currency,
  liquid: z.boolean(),
  parentId: nullableId,
  institutionId: nullableId,
  institutionName: z.string().trim().optional(),
  ownerUserId: nullableId,
  note: z.string().trim().max(500).nullish(),
  defaultPocketName: z.string().trim().max(80).optional(),
});

const createSchema = accountSchema.extend({ initialBalance: cents.nullish() });

const balancesSchema = z.object({
  date: isoDate,
  updates: z.array(z.object({ accountId: z.string().min(1), amount: cents })),
});

/** Colore stabile a partire dal nome: la stessa busta non cambia tinta. */
function hashColor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 7;
}

async function toInput(
  householdId: string,
  parsed: z.infer<typeof accountSchema>,
): Promise<AccountInput> {
  const institutionId =
    parsed.institutionId ??
    (parsed.institutionName ? await findOrCreateInstitution(householdId, parsed.institutionName) : null);
  return {
    name: parsed.name,
    type: parsed.type,
    category: parsed.category,
    currency: parsed.currency,
    liquid: parsed.liquid,
    parentId: parsed.parentId,
    institutionId,
    ownerUserId: parsed.ownerUserId,
    note: parsed.note ?? null,
    defaultPocketName: parsed.defaultPocketName,
  };
}

@Controller()
export class AccountsController {
  @Get("accounts")
  list(
    @Ctx() ctx: RequestContext,
    @Query("asOf") asOf?: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return listAccounts(ctx.household.id, {
      asOf: asOf ? isoDate.parse(asOf) : undefined,
      includeArchived: includeArchived === "true",
    });
  }

  @Get("accounts/:id")
  async get(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    const account = await getAccount(ctx.household.id, id);
    if (!account) throw new NotFoundException({ code: "accountNotFound" });
    return account;
  }

  @Get("accounts/:id/history")
  history(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    return accountHistory(ctx.household.id, id);
  }

  @Get("institutions")
  institutions(@Ctx() ctx: RequestContext) {
    return listInstitutions(ctx.household.id);
  }

  @Writable()
  @Post("accounts")
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const parsed = createSchema.parse(body);
    const input = await toInput(ctx.household.id, parsed);
    const date = today();
    const rates = await ratesForDate(date);
    const amount = parsed.initialBalance ?? null;

    const id = await createAccount(
      ctx.household.id,
      input,
      amount === null
        ? undefined
        : {
            amount,
            date,
            rateToBase: rateToBase(parsed.currency, ctx.household.baseCurrency, rates),
            userId: ctx.user.id,
          },
    );

    // Un Pocket e una busta reale: crearla subito evita che l'utente debba
    // imparare un concetto nuovo prima di poter ripartire lo stipendio.
    if (parsed.type === "pocket" || parsed.category === "pocket" || parsed.parentId) {
      await ensureEnvelopeForAccount(ctx.household.id, id, parsed.name, hashColor(parsed.name));
    }
    return { id };
  }

  @Writable()
  @Put("accounts/:id")
  async update(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const input = await toInput(ctx.household.id, accountSchema.parse(body));
    await updateAccount(ctx.household.id, id, input);
    return { id };
  }

  @Writable()
  @Post("accounts/:id/archive")
  async archive(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    const { archived } = z.object({ archived: z.boolean() }).parse(body);
    await setArchived(ctx.household.id, id, archived);
  }

  @Writable()
  @Delete("accounts/:id")
  async remove(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await deleteAccount(ctx.household.id, id);
  }

  /** Saldi in blocco: o passano tutti, o nessuno. */
  @Writable()
  @Post("balances")
  saveBalances(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const { date, updates } = balancesSchema.parse(body);
    if (date > today()) throw new DomainError("futureDate");
    return saveBalances(ctx.household.id, date, updates, {
      userId: ctx.user.id,
      baseCurrency: ctx.household.baseCurrency,
    });
  }
}
