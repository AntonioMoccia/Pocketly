import { execFileSync } from "node:child_process";
import postgres from "postgres";

/**
 * Prepara il database dei test: applica le migrazioni e svuota le tabelle.
 *
 * I test devono poter girare due volte di fila con lo stesso risultato: senza
 * questo azzeramento il secondo giro troverebbe un utente gia registrato e il
 * primo passo cambierebbe comportamento.
 */
export default async function globalSetup() {
  const url =
    process.env.E2E_DATABASE_URL ?? "postgres://pocketly:pocketly@localhost:55432/pocketly_e2e";

  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "../api/src/db/migrate.mts"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" },
  );

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> '__drizzle_migrations'
    `;
    if (tables.length > 0) {
      const names = tables.map((row) => `"${row.tablename}"`).join(", ");
      // `restart identity cascade` azzera anche le sequenze e le dipendenze.
      await sql.unsafe(`truncate table ${names} restart identity cascade`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
