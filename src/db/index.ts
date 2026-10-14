/**
 * Client Postgres condiviso.
 *
 * In sviluppo il client vive su `globalThis` per sopravvivere all'hot reload di
 * Next: senza questo accorgimento ogni ricompilazione aprirebbe un nuovo pool.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://pocketly:pocketly@localhost:5432/pocketly";

declare global {
  // eslint-disable-next-line no-var
  var __pocketlySql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  return postgres(DATABASE_URL, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 15,
    // Gli importi sono bigint in Postgres ma interi sicuri in JS: li leggiamo
    // come number, non come BigInt, cosi attraversano i confini di React.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number) => String(value),
        parse: (value: string) => Number(value),
      },
    },
  });
}

export const sql = globalThis.__pocketlySql ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__pocketlySql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema };
