/**
 * Sonda di salute per Docker e per i reverse proxy. Il frontend non parla col
 * database: e sano se risponde e se raggiunge l'API, che a sua volta controlla
 * il database.
 */
import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${apiUrl()}/api/v1/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { status: "error", detail: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
