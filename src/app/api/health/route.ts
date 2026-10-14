/**
 * Sonda di salute per Docker e per i reverse proxy: controlla che il database
 * risponda, non solo che il processo sia vivo.
 */
import { sql } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`select 1`;
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { status: "error", detail: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
