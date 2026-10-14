"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, authRequest } from "@/lib/api";
import { getSession } from "@/lib/session";
import { isLocale, LOCALE_COOKIE } from "@/i18n/request";

/** Cambia lingua: cookie per l'interfaccia, profilo per i prossimi accessi. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const value = String(formData.get("locale") ?? "");
  if (!isLocale(value)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });

  if (await getSession()) await api.put("/me/locale", { locale: value });

  revalidatePath("/", "layout");
}

export async function signOutAction(): Promise<void> {
  await authRequest("/sign-out", {});
  redirect("/login");
}

/** Chiude una sessione dell'utente: un telefono perso, un token da ritirare. */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId) await api.delete(`/me/sessions/${encodeURIComponent(sessionId)}`);
  revalidatePath("/settings");
}
