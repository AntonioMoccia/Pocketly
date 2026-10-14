#!/usr/bin/env node
/**
 * Avvia il server standalone prodotto da `next build`.
 *
 * Il bundle standalone non include `.next/static` e `public`: nell'immagine
 * Docker li copia il Dockerfile, qui li collega lo script, cosi il server di
 * produzione si puo provare anche in locale (e nei test end-to-end).
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("Build standalone non trovata: esegui prima `npm run build`.");
  process.exit(1);
}

cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

const port = process.env.PORT ?? "3000";
const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1" },
});

const stop = (signal) => () => child.kill(signal);
process.on("SIGINT", stop("SIGINT"));
process.on("SIGTERM", stop("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
