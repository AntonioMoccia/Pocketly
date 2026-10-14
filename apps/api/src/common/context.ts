/**
 * Contesto della richiesta: utente, household e ruolo.
 *
 * Il `householdId` che ne esce e l'unico ammesso nelle query, ed e cosi che un
 * household non legge i dati di un altro: nessun endpoint lo accetta dal
 * client.
 */
import { eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { db } from "@api/db";
import { householdMembers, households, users } from "@api/db/schema";
import { auth } from "@api/auth/auth";

export type Role = "owner" | "member" | "viewer";

export type SessionUser = { id: string; name: string; email: string; locale: string };

export type RequestContext = {
  user: SessionUser;
  household: { id: string; name: string; baseCurrency: string; timezone: string };
  role: Role;
};

export async function sessionFromHeaders(headers: IncomingHttpHeaders) {
  return auth.api.getSession({ headers: fromNodeHeaders(headers) });
}

/** Utente con il suo household, o household null se non ne ha ancora uno. */
export async function loadContext(
  userId: string,
): Promise<{ user: SessionUser; household: RequestContext["household"] | null; role: Role | null }> {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("Utente della sessione non trovato");

  const [row] = await db
    .select({
      householdId: households.id,
      householdName: households.name,
      baseCurrency: households.baseCurrency,
      timezone: households.timezone,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  return {
    user: { ...user, locale: user.locale ?? "it" },
    household: row
      ? {
          id: row.householdId,
          name: row.householdName,
          baseCurrency: row.baseCurrency.trim(),
          timezone: row.timezone,
        }
      : null,
    role: row ? row.role : null,
  };
}
