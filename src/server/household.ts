/**
 * Household, membri e inviti (F1.2, F1.3).
 *
 * Il primo utente registrato crea il proprio household e ne diventa owner.
 * Gli altri entrano solo con un link di invito, che nel database vive come
 * hash: chi legge la tabella non puo usarlo per entrare.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  allocationTemplateLines,
  allocationTemplates,
  householdInvites,
  householdMembers,
  households,
  users,
} from "@/db/schema";
import { generateInviteToken, hashToken } from "@/lib/crypto";
import { isValidCurrency } from "@/lib/money";
import { DomainError } from "./accounts";
import type { Role } from "@/lib/session";

export async function createHousehold(
  userId: string,
  input: { name: string; baseCurrency: string; timezone: string },
): Promise<string> {
  const currency = input.baseCurrency.trim().toUpperCase();
  if (!isValidCurrency(currency)) throw new DomainError("invalidCurrency");

  return db.transaction(async (tx) => {
    const [household] = await tx
      .insert(households)
      .values({
        name: input.name.trim() || "Household",
        baseCurrency: currency,
        timezone: input.timezone,
      })
      .returning({ id: households.id });
    if (!household) throw new DomainError("validation");

    await tx.insert(householdMembers).values({
      householdId: household.id,
      userId,
      role: "owner",
      contributionShareBps: 10_000,
    });
    return household.id;
  });
}

export async function updateHousehold(
  householdId: string,
  input: { name: string; baseCurrency: string; timezone: string },
): Promise<void> {
  const currency = input.baseCurrency.trim().toUpperCase();
  if (!isValidCurrency(currency)) throw new DomainError("invalidCurrency");
  await db
    .update(households)
    .set({ name: input.name.trim(), baseCurrency: currency, timezone: input.timezone })
    .where(eq(households.id, householdId));
}

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  contributionShareBps: number;
};

export async function listMembers(householdId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: householdMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: householdMembers.role,
      contributionShareBps: householdMembers.contributionShareBps,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(asc(householdMembers.createdAt));
  return rows;
}

export async function updateMember(
  householdId: string,
  memberId: string,
  input: { role?: Role; contributionShareBps?: number },
): Promise<void> {
  if (input.role && input.role !== "owner") {
    // Senza owner l'household resterebbe senza nessuno che puo invitare.
    const [current] = await db
      .select({ role: householdMembers.role })
      .from(householdMembers)
      .where(
        and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)),
      )
      .limit(1);
    if (current?.role === "owner" && (await countOwners(householdId)) <= 1) {
      throw new DomainError("lastOwner");
    }
  }

  await db
    .update(householdMembers)
    .set({
      ...(input.role ? { role: input.role } : {}),
      ...(input.contributionShareBps !== undefined
        ? { contributionShareBps: clampBps(input.contributionShareBps) }
        : {}),
    })
    .where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)));
}

export async function removeMember(householdId: string, memberId: string): Promise<void> {
  const [member] = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)))
    .limit(1);
  if (!member) throw new DomainError("notFound");
  if (member.role === "owner" && (await countOwners(householdId)) <= 1) {
    throw new DomainError("lastOwner");
  }
  await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)));
}

async function countOwners(householdId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(householdMembers)
    .where(
      and(eq(householdMembers.householdId, householdId), eq(householdMembers.role, "owner")),
    );
  return Number(row?.value ?? 0);
}

function clampBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(10_000, Math.max(0, Math.round(value)));
}

const INVITE_DAYS = 7;

/** Crea un invito e restituisce il token in chiaro: si mostra una volta sola. */
export async function createInvite(
  householdId: string,
  input: { role: Role; email: string | null; invitedBy: string },
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.insert(householdInvites).values({
    householdId,
    tokenHash,
    role: input.role,
    email: input.email?.trim().toLowerCase() || null,
    invitedBy: input.invitedBy,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function listInvites(householdId: string) {
  return db
    .select({
      id: householdInvites.id,
      role: householdInvites.role,
      email: householdInvites.email,
      expiresAt: householdInvites.expiresAt,
      createdAt: householdInvites.createdAt,
    })
    .from(householdInvites)
    .where(
      and(eq(householdInvites.householdId, householdId), isNull(householdInvites.acceptedAt)),
    )
    .orderBy(asc(householdInvites.createdAt));
}

export async function revokeInvite(householdId: string, inviteId: string): Promise<void> {
  await db
    .delete(householdInvites)
    .where(and(eq(householdInvites.id, inviteId), eq(householdInvites.householdId, householdId)));
}

export type InviteCheck =
  | { valid: true; householdId: string; householdName: string; role: Role; email: string | null }
  | { valid: false };

/** Verifica un token di invito senza consumarlo, per la pagina di iscrizione. */
export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!token) return { valid: false };
  const [row] = await db
    .select({
      householdId: householdInvites.householdId,
      householdName: households.name,
      role: householdInvites.role,
      email: householdInvites.email,
      expiresAt: householdInvites.expiresAt,
      acceptedAt: householdInvites.acceptedAt,
    })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .where(eq(householdInvites.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || row.acceptedAt || row.expiresAt.getTime() < Date.now()) return { valid: false };
  return {
    valid: true,
    householdId: row.householdId,
    householdName: row.householdName,
    role: row.role,
    email: row.email,
  };
}

/**
 * Consuma l'invito e iscrive l'utente. Transazione e `acceptedAt is null` nella
 * clausola di aggiornamento: due click sullo stesso link non creano due membri.
 */
export async function acceptInvite(token: string, userId: string): Promise<string> {
  const tokenHash = hashToken(token);
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(householdInvites)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(
        and(
          eq(householdInvites.tokenHash, tokenHash),
          isNull(householdInvites.acceptedAt),
          sql`${householdInvites.expiresAt} > now()`,
        ),
      )
      .returning({ householdId: householdInvites.householdId, role: householdInvites.role });

    const invite = claimed[0];
    if (!invite) throw new DomainError("inviteInvalid");

    await tx
      .insert(householdMembers)
      .values({ householdId: invite.householdId, userId, role: invite.role })
      .onConflictDoNothing();

    return invite.householdId;
  });
}

/** Household di un utente, se ne ha uno: decide se mostrare l'onboarding. */
export async function householdOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return row?.householdId ?? null;
}

export async function setUserLocale(userId: string, locale: string): Promise<void> {
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}

/** Conta le righe di modello: serve a capire se l'onboarding e completo. */
export async function hasTemplate(householdId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: allocationTemplates.id })
    .from(allocationTemplates)
    .innerJoin(
      allocationTemplateLines,
      eq(allocationTemplateLines.templateId, allocationTemplates.id),
    )
    .where(eq(allocationTemplates.householdId, householdId))
    .limit(1);
  return Boolean(row);
}
