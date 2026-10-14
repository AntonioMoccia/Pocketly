/**
 * Autenticazione con Better Auth: email e password, TOTP opzionale, passkey.
 * Nessun servizio esterno, cosi il self-hosting non dipende da terzi.
 *
 * Nel self-hosted il primo utente registrato diventa owner dell'household
 * (F1.1) e, con `SIGNUP=invite`, le registrazioni successive passano solo da un
 * link di invito: un'istanza esposta su internet non raccoglie estranei.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { twoFactor } from "better-auth/plugins";
import { count } from "drizzle-orm";
import { db } from "@/db";
import {
  authAccounts,
  passkeys,
  sessions,
  twoFactors,
  users,
  verifications,
} from "@/db/schema";
import { env } from "./env";

/** Numero di utenti registrati: decide chi puo iscriversi. */
export async function userCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(users);
  return Number(row?.value ?? 0);
}

export const auth = betterAuth({
  appName: "Pocketly",
  secret: env().BETTER_AUTH_SECRET,
  baseURL: env().BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: authAccounts,
      verification: verifications,
      twoFactor: twoFactors,
      passkey: passkeys,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      locale: { type: "string", required: false, defaultValue: env().DEFAULT_LOCALE, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    useSecureCookies: env().BETTER_AUTH_URL.startsWith("https://"),
  },
  plugins: [
    twoFactor({ issuer: "Pocketly" }),
    passkey({ rpName: "Pocketly" }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
