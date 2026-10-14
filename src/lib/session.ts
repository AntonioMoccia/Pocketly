/**
 * Contesto della richiesta: utente, household e ruolo.
 *
 * Ogni pagina e ogni azione passa da qui: il `householdId` che ne esce e
 * l'unico ammesso nelle query, ed e cosi che un household non legge i dati di
 * un altro.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { householdMembers, households, users } from "@/db/schema";
import { auth } from "./auth";
import { readLocale, type Locale } from "@/i18n/request";
import { AuthorizationError } from "./errors";

export type Role = "owner" | "member" | "viewer";

export type RequestContext = {
  user: { id: string; name: string; email: string; locale: string };
  household: { id: string; name: string; baseCurrency: string; timezone: string };
  role: Role;
  locale: Locale;
};

/** Sessione Better Auth, con cache per richiesta. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Contesto completo, o null se manca la sessione o l'household.
 * `cache` lo rende una sola query per richiesta anche se lo chiedono in dieci.
 */
export const getContext = cache(async (): Promise<RequestContext | null> => {
  const session = await getSession();
  if (!session?.user) return null;

  const [row] = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userLocale: users.locale,
      householdId: households.id,
      householdName: households.name,
      baseCurrency: households.baseCurrency,
      timezone: households.timezone,
      role: householdMembers.role,
    })
    .from(users)
    .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!row) return null;

  return {
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      locale: row.userLocale,
    },
    household: {
      id: row.householdId,
      name: row.householdName,
      baseCurrency: row.baseCurrency.trim(),
      timezone: row.timezone,
    },
    role: row.role,
    locale: await readLocale(),
  };
});

/** Per le pagine: senza sessione va al login, senza household all'onboarding. */
export async function requireContext(): Promise<RequestContext> {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const context = await getContext();
  if (!context) redirect("/onboarding");
  return context;
}

export { AuthorizationError } from "./errors";

/** Per le azioni: owner e member scrivono, viewer e di sola lettura. */
export function assertCanWrite(context: RequestContext): void {
  if (context.role === "viewer") {
    throw new AuthorizationError("Il tuo ruolo e di sola lettura");
  }
}

export function assertOwner(context: RequestContext): void {
  if (context.role !== "owner") {
    throw new AuthorizationError("Serve il ruolo owner");
  }
}

/** Contesto scrivibile per le azioni; lancia invece di reindirizzare. */
export async function requireWritableContext(): Promise<RequestContext> {
  const context = await getContext();
  if (!context) throw new AuthorizationError("Sessione non valida");
  assertCanWrite(context);
  return context;
}
