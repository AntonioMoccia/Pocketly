/**
 * Better Auth vive nell'API: questa route inoltra le richieste del browser
 * (passkey, sessione lato client) cosi come sono, cookie compresi. Il browser
 * vede un solo indirizzo, quello del sito.
 */
import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

async function forward(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = `${apiUrl()}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });

  // `fetch` decomprime il corpo: le intestazioni di codifica non valgono piu.
  const out = new Headers(response.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");
  return new Response(response.body, { status: response.status, headers: out });
}

export const GET = forward;
export const POST = forward;
