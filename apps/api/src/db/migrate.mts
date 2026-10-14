/**
 * Applica le migrazioni. Gira all'avvio del container (F1.1) e in CI.
 *
 * Usa un lock applicativo di Postgres: se piu istanze partono insieme, una
 * sola applica le migrazioni e le altre attendono.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

const LOCK_KEY = 8_273_461_209;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL non impostata.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    await waitForDatabase(client);
    await client`select pg_advisory_lock(${LOCK_KEY})`;
    console.log("Applico le migrazioni...");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrazioni applicate.");
  } finally {
    await client`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await client.end({ timeout: 5 });
  }
}

/** All'avvio di `docker compose up` Postgres puo non essere ancora pronto. */
async function waitForDatabase(client: postgres.Sql, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await client`select 1`;
      return;
    } catch (error) {
      if (i === attempts) throw error;
      console.log(`Database non pronto, nuovo tentativo (${i}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

main().catch((error) => {
  console.error("Migrazioni non applicate:", error);
  process.exit(1);
});
