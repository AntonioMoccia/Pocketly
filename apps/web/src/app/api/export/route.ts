/**
 * Export dei dati dell'household (F1.14).
 *
 * Il file lo produce l'API; questa rotta resta perche i link di download della
 * pagina impostazioni puntano qui. Gira la richiesta con il cookie di sessione
 * e restituisce la risposta cosi com'e, intestazioni del download comprese.
 */
import { apiUrl, publicUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const cookie = request.headers.get("cookie");

  const upstream = await fetch(`${apiUrl()}/api/v1/export?format=${format}`, {
    headers: { origin: publicUrl(), ...(cookie ? { cookie } : {}) },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new Response(upstream.status === 401 ? "Unauthorized" : "Export failed", {
      status: upstream.status,
    });
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-disposition"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Lo stream passa senza essere letto in memoria: un export grande non pesa su Next.
  return new Response(upstream.body, { status: 200, headers });
}
