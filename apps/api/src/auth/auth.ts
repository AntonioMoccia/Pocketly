/**
 * Autenticazione con Better Auth: email e password, TOTP opzionale, passkey.
 * Nessun servizio esterno, cosi il self-hosting non dipende da terzi.
 *
 * Vive nell'API, ma il browser la raggiunge dall'indirizzo del sito: Next
 * inoltra `/api/auth/*` all'API, cosi cookie e passkey restano legati al
 * dominio che l'utente vede. Per questo `BETTER_AUTH_URL` e l'URL pubblico del
 * sito, non quello dell'API.
 *
 * Gli altri client (app, script) fanno login sull'API con gli endpoint di
 * `modules/auth/token.controller.ts` e ricevono un token di sessione.
 *
 * Nel self-hosted il primo utente registrato diventa owner dell'household
 * (F1.1) e, con `SIGNUP=invite`, le registrazioni successive passano solo da un
 * link di invito: un'istanza esposta su internet non raccoglie estranei.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { bearer, twoFactor } from "better-auth/plugins";
import { count } from "drizzle-orm";
import { db } from "@api/db";
import {
  authAccounts,
  passkeys,
  sessions,
  twoFactors,
  users,
  verifications,
} from "@api/db/schema";
import { env } from "@api/lib/env";

/**
 * Intestazione con l'indirizzo del client, scritta dall'API stessa a ogni
 * richiesta (vedi `main.ts`): Better Auth non guarda le altre.
 */
export const CLIENT_IP_HEADER = "x-pocketly-client-ip";

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
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
  plugins: [
    twoFactor({ issuer: "Pocketly" }),
    passkey({ rpName: "Pocketly" }),
    // Client diversi dal sito (app, script, integrazioni): la sessione viaggia
    // come `Authorization: Bearer <token>` invece che come cookie. Si accettano
    // solo token firmati, cioe quelli che l'API stessa ha consegnato.
    bearer({ requireSignature: true }),
  ],
});

export type Auth = typeof auth;
