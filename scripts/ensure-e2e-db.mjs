#!/usr/bin/env node
/**
 * Crea il database dei test end-to-end se non esiste.
 *
 * Gira prima di Playwright, non dentro: il server di prova parte per primo e
 * la sua sonda di salute interroga il database, quindi a quel punto deve gia
 * esserci. Capita di cancellarlo insieme al volume di Docker.
 */
import postgres from "postgres";

const url =
  process.env.E2E_DATABASE_URL ?? "postgres://pocketly:pocketly@localhost:55432/pocketly_e2e";

const name = new URL(url).pathname.replace(/^\//, "");
const adminUrl = `${url.slice(0, url.lastIndexOf("/"))}/postgres`;

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
try {
  const rows = await admin`select 1 from pg_database where datname = ${name}`;
  if (rows.length === 0) {
    await admin.unsafe(`create database "${name}"`);
    console.log(`Database di test "${name}" creato.`);
  } else {
    console.log(`Database di test "${name}" presente.`);
  }
} catch (error) {
  console.error("Database di test non disponibile:", error.message);
  console.error("Il database di sviluppo e avviato? `docker compose up -d db`");
  process.exit(1);
} finally {
  await admin.end({ timeout: 5 });
}
