#!/usr/bin/env node
/**
 * Prepara il file .env partendo da .env.example, generando i segreti.
 * Non sovrascrive un .env esistente: completa solo i valori vuoti.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const EXAMPLE = ".env.example";
const TARGET = ".env";

if (!existsSync(EXAMPLE)) {
  console.error(`${EXAMPLE} non trovato: esegui lo script dalla radice del progetto.`);
  process.exit(1);
}

const base = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : readFileSync(EXAMPLE, "utf8");
const generated = [];

function fill(content, key, value) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const match = content.match(re);
  if (!match) return `${content.trimEnd()}\n${key}=${value}\n`;
  if (match[1].trim() !== "" && match[1].trim() !== "cambiami") return content;
  generated.push(key);
  return content.replace(re, `${key}=${value}`);
}

let out = base;
const dbPassword = randomBytes(18).toString("base64url");
out = fill(out, "POSTGRES_PASSWORD", dbPassword);
if (generated.includes("POSTGRES_PASSWORD")) {
  out = out.replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL=postgres://pocketly:${dbPassword}@localhost:5432/pocketly`,
  );
}
out = fill(out, "BETTER_AUTH_SECRET", randomBytes(32).toString("base64url"));
out = fill(out, "ENCRYPTION_KEY", randomBytes(32).toString("base64"));

writeFileSync(TARGET, out);
console.log(
  generated.length > 0
    ? `.env pronto. Valori generati: ${generated.join(", ")}`
    : ".env era gia completo: nessuna modifica.",
);
