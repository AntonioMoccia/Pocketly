/**
 * Household, membri e inviti (F1.2, F1.3).
 *
 * Le impostazioni dell'household le cambia chi puo scrivere; membri e inviti
 * solo l'owner, perche decidono chi vede i dati di tutti.
 */
import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import {
  createInvite,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  updateHousehold,
  updateMember,
} from "@api/data/household";
import { Ctx, OwnerOnly, Writable } from "../../common/guards";
import type { RequestContext } from "../../common/context";
import { currency } from "../../common/schemas";

const role = z.enum(["owner", "member", "viewer"]);

const householdSchema = z.object({
  name: z.string().trim().max(80),
  baseCurrency: currency,
  timezone: z.string().trim().min(1),
});

const memberSchema = z.object({
  role: role.optional(),
  contributionShareBps: z.number().int().min(0).max(10_000).optional(),
});

const inviteSchema = z.object({
  role,
  email: z.string().trim().max(200).nullish().transform((value) => value || null),
});

@Controller("household")
export class HouseholdController {
  @Writable()
  @Put()
  async update(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    await updateHousehold(ctx.household.id, householdSchema.parse(body));
  }

  @Get("members")
  members(@Ctx() ctx: RequestContext) {
    return listMembers(ctx.household.id);
  }

  @OwnerOnly()
  @Put("members/:id")
  async updateMember(@Ctx() ctx: RequestContext, @Param("id") id: string, @Body() body: unknown) {
    await updateMember(ctx.household.id, id, memberSchema.parse(body));
  }

  @OwnerOnly()
  @Delete("members/:id")
  async removeMember(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await removeMember(ctx.household.id, id);
  }

  @OwnerOnly()
  @Get("invites")
  invites(@Ctx() ctx: RequestContext) {
    return listInvites(ctx.household.id);
  }

  /** Il token torna in chiaro solo qui: nel database ne resta l'hash. */
  @OwnerOnly()
  @Post("invites")
  createInvite(@Ctx() ctx: RequestContext, @Body() body: unknown) {
    const parsed = inviteSchema.parse(body);
    return createInvite(ctx.household.id, { ...parsed, invitedBy: ctx.user.id });
  }

  @OwnerOnly()
  @Delete("invites/:id")
  async revokeInvite(@Ctx() ctx: RequestContext, @Param("id") id: string) {
    await revokeInvite(ctx.household.id, id);
  }
}
