#!/usr/bin/env node
/**
 * Sviluppo: avvia API e frontend insieme, con le variabili del `.env` della
 * radice. L'API ricompila a ogni modifica; Next ha il suo hot reload.
 * Ctrl+C ferma entrambi.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const env = {
  ...process.env,
  API_URL: process.env.API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`,
};

const children = [
  spawn("npm", ["run", "dev", "-w", "@pocketly/api"], { stdio: "inherit", env }),
  spawn("npm", ["run", "dev", "-w", "@pocketly/web"], { stdio: "inherit", env }),
];

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", (code) => {
    // Se uno dei due si ferma, l'altro da solo non serve.
    stop();
    process.exitCode = code ?? 0;
  });
}
