import { expect, test } from "@playwright/test";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";

/**
 * Accesso da client diversi dal sito: un'app o uno script parlano con l'API
 * direttamente, con un token al posto dei cookie.
 *
 * Le chiamate usano `fetch` di Node, che non conserva cookie: se qualcosa
 * funzionasse solo grazie a un cookie, qui fallirebbe.
 */

const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4100}`;

const user = {
  name: "Client",
  email: `client+${Date.now()}@example.test`,
  password: "password-per-le-app",
};

test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; data: Json | null; headers: Headers }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, data: text ? (JSON.parse(text) as Json) : null, headers: response.headers };
}

/** Codice TOTP corrente, calcolato come farebbe l'app di autenticazione. */
async function currentCode(totpUri: string): Promise<string> {
  const secret = new URL(totpUri).searchParams.get("secret") ?? "";
  const raw = new TextDecoder().decode(base32.decode(secret));
  return createOTP(raw).totp();
}

let firstToken = "";
let secondToken = "";
let totpUri = "";

test("un client fa login e riceve un token", async () => {
  const signUp = await call("POST", "/api/v1/auth/sign-up", { body: user });
  expect(signUp.status).toBe(201);

  const wrong = await call("POST", "/api/v1/auth/token", {
    body: { email: user.email, password: "sbagliata-sbagliata" },
  });
  expect(wrong.status).toBe(401);

  const signIn = await call("POST", "/api/v1/auth/token", {
    body: { email: user.email, password: user.password },
  });
  expect(signIn.status).toBe(200);
  firstToken = String(signIn.data?.token ?? "");
  expect(firstToken).not.toBe("");
});

test("il token apre le chiamate all'API, senza cookie", async () => {
  const me = await call("GET", "/api/v1/me", { token: firstToken });
  expect(me.status).toBe(200);
  expect((me.data?.user as Json).email).toBe(user.email);

  expect((await call("GET", "/api/v1/me")).status).toBe(401);
  // Un token alterato non vale: la firma non torna.
  expect((await call("GET", "/api/v1/me", { token: `${firstToken}x` })).status).toBe(401);
});

test("con il secondo fattore il login chiede il codice", async () => {
  const enable = await call("POST", "/api/auth/two-factor/enable", {
    token: firstToken,
    body: { password: user.password },
  });
  expect(enable.status).toBe(200);
  totpUri = String(enable.data?.totpURI ?? "");

  // Better Auth attiva il secondo fattore solo dopo il primo codice valido.
  const confirm = await call("POST", "/api/auth/two-factor/verify-totp", {
    token: firstToken,
    body: { code: await currentCode(totpUri) },
  });
  expect(confirm.status).toBe(200);

  const signIn = await call("POST", "/api/v1/auth/token", {
    body: { email: user.email, password: user.password },
  });
  expect(signIn.status).toBe(200);
  expect(signIn.data?.twoFactorRequired).toBe(true);
  expect(signIn.data?.token).toBeUndefined();
  const challenge = String(signIn.data?.challenge ?? "");

  const wrongCode = await call("POST", "/api/v1/auth/token/two-factor", {
    body: { challenge, code: "000000" },
  });
  expect(wrongCode.status).toBe(401);

  const verified = await call("POST", "/api/v1/auth/token/two-factor", {
    body: { challenge, code: await currentCode(totpUri) },
  });
  expect(verified.status).toBe(200);
  secondToken = String(verified.data?.token ?? "");
  expect((await call("GET", "/api/v1/me", { token: secondToken })).status).toBe(200);
});

test("le sessioni si vedono e si revocano", async () => {
  const list = await call("GET", "/api/v1/me/sessions", { token: secondToken });
  expect(list.status).toBe(200);
  const sessions = list.data as unknown as { id: string; current: boolean; token?: string }[];
  expect(sessions.length).toBeGreaterThanOrEqual(2);
  expect(sessions.filter((session) => session.current)).toHaveLength(1);
  // Il token di una sessione non esce mai dall'API.
  expect(sessions.every((session) => session.token === undefined)).toBe(true);

  const other = sessions.find((session) => !session.current);
  const revoke = await call("DELETE", `/api/v1/me/sessions/${other?.id}`, { token: secondToken });
  expect(revoke.status).toBe(204);
  expect((await call("GET", "/api/v1/me", { token: firstToken })).status).toBe(401);
});

test("il logout chiude la sessione del token", async () => {
  expect((await call("DELETE", "/api/v1/auth/token", { token: secondToken })).status).toBe(204);
  expect((await call("GET", "/api/v1/me", { token: secondToken })).status).toBe(401);
});

test("troppi tentativi sbagliati vengono fermati", async () => {
  // Better Auth tiene pochi tentativi di login per indirizzo in una finestra
  // di pochi secondi: chi prova a indovinare la password si ferma presto.
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await call("POST", "/api/v1/auth/token", {
      body: { email: user.email, password: `tentativo-${attempt}` },
    });
    statuses.push(result.status);
    if (result.status === 429) expect(result.data?.code).toBe("tooManyAttempts");
  }
  expect(statuses).toContain(429);
});
