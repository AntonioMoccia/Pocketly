/**
 * Accesso per client diversi dal sito: app mobile, script, integrazioni.
 *
 * Il sito usa i cookie, che un client nativo gestisce male: qui il login
 * restituisce un token di sessione, da mandare poi a ogni chiamata come
 * `Authorization: Bearer <token>`. E una sessione come quelle del browser:
 * compare fra i dispositivi collegati e si revoca allo stesso modo.
 *
 * Login e secondo fattore passano dall'handler di Better Auth, non dalle sue
 * funzioni interne: cosi valgono anche qui i limiti ai tentativi per indirizzo
 * IP, che difendono la password da chi prova a indovinarla.
 *
 * Con il secondo fattore attivo il login risponde con una `challenge` invece
 * del token. Better Auth la tiene in un cookie firmato; qui viaggia nel corpo
 * della risposta, e torna indietro insieme al codice.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { DomainError } from "@pocketly/domain/errors";
import { env } from "@api/lib/env";
import { auth, CLIENT_IP_HEADER } from "../../auth/auth";
import type { SessionInfo } from "./session-info";
import { Public, SessionOnly } from "../../common/guards";

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const twoFactorSchema = z
  .object({
    challenge: z.string().min(1),
    code: z.string().trim().regex(/^\d{6}$/).optional(),
    backupCode: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.backupCode), {
    message: "Serve code oppure backupCode",
    path: ["code"],
  });

type AuthUser = { id: string; name: string; email: string };

/** Chiama un endpoint di Better Auth come farebbe il browser, ma dal server. */
async function callAuth(
  request: Request,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers({
    "content-type": "application/json",
    // L'indirizzo del client calcolato dall'API (vedi `main.ts`): su questo si
    // contano i tentativi e si registra la sessione.
    [CLIENT_IP_HEADER]: String(request.headers[CLIENT_IP_HEADER] ?? ""),
    ...extraHeaders,
  });
  const userAgent = request.headers["user-agent"];
  if (userAgent) headers.set("user-agent", userAgent);

  const response = await auth.handler(
    new Request(`${env().BETTER_AUTH_URL}/api/auth${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

function tooManyAttempts(status: number): void {
  if (status === 429) throw new DomainError("tooManyAttempts");
}

/** Token firmato consegnato dal plugin bearer, o errore se manca. */
function issuedToken(response: Response, data: Record<string, unknown> | null) {
  const token = response.headers.get("set-auth-token");
  if (!token) throw new UnauthorizedException({ code: "invalidCredentials" });
  return { token, user: data?.user as AuthUser | undefined };
}

@Controller("auth/token")
export class TokenController {
  /**
   * Login con email e password. Risponde `{ token, user }`, oppure
   * `{ twoFactorRequired: true, challenge }` se l'utente ha il secondo fattore.
   */
  @Public()
  @Post()
  @HttpCode(200)
  async signIn(@Req() request: Request, @Body() body: unknown) {
    const input = signInSchema.parse(body);
    const { response, data } = await callAuth(request, "/sign-in/email", input);
    tooManyAttempts(response.status);
    if (!response.ok) throw new UnauthorizedException({ code: "invalidCredentials" });

    if (data?.twoFactorRedirect) {
      const cookie = response.headers
        .getSetCookie()
        .map((line) => line.split(";")[0] ?? "")
        .find((pair) => pair.split("=")[0]?.endsWith("two_factor"));
      if (!cookie) throw new UnauthorizedException({ code: "invalidCredentials" });
      return {
        twoFactorRequired: true,
        challenge: Buffer.from(cookie).toString("base64url"),
      };
    }
    return issuedToken(response, data);
  }

  /** Secondo passo: il codice dell'app di autenticazione o un codice di riserva. */
  @Public()
  @Post("two-factor")
  @HttpCode(200)
  async verifyTwoFactor(@Req() request: Request, @Body() body: unknown) {
    const input = twoFactorSchema.parse(body);
    const cookie = Buffer.from(input.challenge, "base64url").toString("utf8");
    if (!/^[\w.-]*two_factor=[^;\s]+$/.test(cookie)) {
      throw new UnauthorizedException({ code: "invalidChallenge" });
    }

    const { response, data } = await callAuth(
      request,
      input.code ? "/two-factor/verify-totp" : "/two-factor/verify-backup-code",
      input.code ? { code: input.code } : { code: input.backupCode },
      // Con un cookie nella richiesta Better Auth vuole un'origine fidata:
      // quella del sito, perche la chiamata parte dall'API stessa.
      { cookie, origin: env().BETTER_AUTH_URL },
    );
    tooManyAttempts(response.status);
    if (!response.ok) throw new UnauthorizedException({ code: "invalidTwoFactorCode" });
    return issuedToken(response, data);
  }

  /** Logout: chiude la sessione del token con cui arriva la richiesta. */
  @SessionOnly()
  @Delete()
  @HttpCode(204)
  async signOut(@Req() request: Request) {
    await auth.api.signOut({ headers: fromNodeHeaders(request.headers) });
  }
}

/**
 * Dispositivi collegati: le sessioni aperte dell'utente, dal sito o da altri
 * client. Il token non esce mai: per revocare basta l'id.
 */
@Controller("me/sessions")
export class SessionsController {
  @SessionOnly()
  @Get()
  async list(@Req() request: Request): Promise<SessionInfo[]> {
    const headers = fromNodeHeaders(request.headers);
    const [sessions, current] = await Promise.all([
      auth.api.listSessions({ headers }),
      auth.api.getSession({ headers }),
    ]);
    return sessions
      .map((session) => ({
        id: session.id,
        current: session.id === current?.session.id,
        userAgent: session.userAgent ?? null,
        ipAddress: session.ipAddress ?? null,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: new Date(session.updatedAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  @SessionOnly()
  @Delete(":id")
  @HttpCode(204)
  async revoke(@Req() request: Request, @Param("id") id: string) {
    const headers = fromNodeHeaders(request.headers);
    // `listSessions` restituisce solo le sessioni dell'utente: una sessione di
    // qualcun altro qui non si trova, e quindi non si revoca.
    const sessions = await auth.api.listSessions({ headers });
    const target = sessions.find((session) => session.id === id);
    if (!target) throw new DomainError("notFound");
    await auth.api.revokeSession({ body: { token: target.token }, headers });
  }
}
