/**
 * Client dell'API di Pocketly, solo lato server (pagine e Server Action).
 *
 * Il frontend non parla piu col database: chiede tutto all'API, passandole il
 * cookie di sessione dell'utente. L'API ricava da li utente e household, quindi
 * nessuna chiamata porta un `householdId`.
 */
import { cookies, headers } from "next/headers";

/** Indirizzo interno dell'API (in Docker, il nome del servizio). */
export function apiUrl(): string {
  return (process.env.API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
}

/** URL pubblico del sito: e l'origine che Better Auth considera fidata. */
export function publicUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: {
      code: string;
      fieldErrors?: Record<string, string>;
      reason?: string;
      detail?: Record<string, unknown>;
    },
  ) {
    super(`API ${status}: ${code}`);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function forwardedHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const out: Record<string, string> = { origin: publicUrl() };
  const cookie = incoming.get("cookie");
  if (cookie) out.cookie = cookie;
  const forwardedFor = incoming.get("x-forwarded-for");
  if (forwardedFor) out["x-forwarded-for"] = forwardedFor;
  const userAgent = incoming.get("user-agent");
  if (userAgent) out["user-agent"] = userAgent;
  return out;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${apiUrl()}/api/v1${withQuery(path, options.query)}`, {
    method,
    headers: {
      ...(await forwardedHeaders()),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ code: "serverError" }))) as ApiError["body"];
    throw new ApiError(response.status, body.code ?? "serverError", body);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text === "" ? undefined : JSON.parse(text)) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T = void>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} }),
  put: <T = void>(path: string, body?: unknown) => request<T>("PUT", path, { body: body ?? {} }),
  patch: <T = void>(path: string, body?: unknown) => request<T>("PATCH", path, { body: body ?? {} }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};

/**
 * Chiamata a un endpoint di Better Auth (`/api/auth/*`) da una Server Action.
 * I cookie che l'API imposta (sessione, secondo fattore) vengono copiati sulla
 * risposta di Next, cosi arrivano al browser come se li avesse scritti lui.
 */
export async function authRequest<T = unknown>(
  path: string,
  body?: unknown,
  options: { method?: "GET" | "POST"; v1?: boolean } = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const base = options.v1 ? `${apiUrl()}/api/v1` : `${apiUrl()}/api/auth`;
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "POST",
    headers: {
      ...(await forwardedHeaders()),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  await applySetCookies(response);
  const text = await response.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

async function applySetCookies(response: Response): Promise<void> {
  const list = response.headers.getSetCookie();
  if (list.length === 0) return;
  const store = await cookies();
  for (const line of list) {
    const [pair, ...attributes] = line.split(";").map((part) => part.trim());
    if (!pair) continue;
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = decodeURIComponent(pair.slice(separator + 1));

    const options: Parameters<typeof store.set>[2] = {};
    for (const attribute of attributes) {
      const [rawKey, ...rest] = attribute.split("=");
      const key = rawKey?.toLowerCase();
      const attributeValue = rest.join("=");
      if (key === "path") options.path = attributeValue;
      else if (key === "max-age") options.maxAge = Number(attributeValue);
      else if (key === "expires") options.expires = new Date(attributeValue);
      else if (key === "httponly") options.httpOnly = true;
      else if (key === "secure") options.secure = true;
      else if (key === "samesite") {
        options.sameSite = attributeValue.toLowerCase() as "lax" | "strict" | "none";
      }
    }
    store.set(name, value, options);
  }
}
