/**
 * Configurazione next-intl senza prefisso di lingua nell'URL: l'app sta dietro
 * login, quindi la lingua segue l'utente (cookie) e non l'indirizzo.
 */
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["it", "en"] as const;
export type Locale = (typeof locales)[number];

export const LOCALE_COOKIE = "pocketly_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "it" || value === "en";
}

export function defaultLocale(): Locale {
  const fromEnv = process.env.DEFAULT_LOCALE;
  return isLocale(fromEnv) ? fromEnv : "it";
}

export async function readLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale();
}

export default getRequestConfig(async () => {
  const locale = await readLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: process.env.TZ ?? "Europe/Rome",
    now: new Date(),
  };
});
