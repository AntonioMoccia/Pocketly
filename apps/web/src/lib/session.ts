/**
 * Contesto della richiesta: utente, household e ruolo.
 *
 * Arriva dall'API (`GET /me`), che lo ricava dal cookie di sessione. Il
 * frontend lo usa per decidere dove mandare l'utente e cosa mostrargli; i
 * permessi veri li controlla comunque l'API a ogni chiamata.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { api, ApiError } from "./api";
import { readLocale, type Locale } from "@/i18n/request";
import { AuthorizationError } from "@pocketly/domain/errors";

export type Role = "owner" | "member" | "viewer";

export type RequestContext = {
  user: { id: string; name: string; email: string; locale: string };
  household: { id: string; name: string; baseCurrency: string; timezone: string };
  role: Role;
  locale: Locale;
};

type Me = {
  user: RequestContext["user"];
  household: RequestContext["household"] | null;
  role: Role | null;
};

/** Utente e household della sessione, o null senza sessione. Una chiamata per richiesta. */
const getMe = cache(async (): Promise<Me | null> => {
  try {
    return await api.get<Me>("/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

/** Sessione dell'utente, o null. */
export const getSession = cache(async () => {
  const me = await getMe();
  return me ? { user: me.user } : null;
});

/** Contesto completo, o null se manca la sessione o l'household. */
export const getContext = cache(async (): Promise<RequestContext | null> => {
  const me = await getMe();
  if (!me?.household || !me.role) return null;
  return {
    user: me.user,
    household: me.household,
    role: me.role,
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

export { AuthorizationError } from "@pocketly/domain/errors";

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
