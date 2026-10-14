"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getContext } from "@/lib/session";
import { setUserLocale } from "@/server/household";
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

  const context = await getContext();
  if (context) await setUserLocale(context.user.id, value);

  revalidatePath("/", "layout");
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
