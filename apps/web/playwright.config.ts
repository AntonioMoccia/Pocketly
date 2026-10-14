import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// La configurazione dei test legge lo stesso .env dell'app: senza, finirebbe
// per puntare a un database con credenziali sbagliate.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://pocketly:pocketly@localhost:55432/pocketly_e2e";

/**
 * I test end-to-end girano contro l'app vera e un database vero: i calcoli di
 * denaro si verificano solo cosi.
 *
 * `E2E_DATABASE_URL` punta a un database separato, che il setup azzera prima
 * di partire: i test non devono mai toccare i dati di chi sviluppa.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // I file girano in ordine di nome, uno alla volta: condividono un database
  // solo e il primo registra l'utente owner.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      // Chromium con viewport e tocco da telefono: serve a verificare il
      // layout a 375 px, non le differenze di motore, e non obbliga a
      // scaricare WebKit per far girare la suite.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: false,
        hasTouch: true,
      },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  // Due servizi, come in produzione: l'API (unica a parlare col database) e
  // il frontend, che la chiama. Prima l'API: la sonda del frontend la
  // interroga.
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: DATABASE_URL,
        BETTER_AUTH_URL: BASE_URL,
        DISABLE_JOBS: "true",
        SIGNUP: "open",
        NODE_ENV: "production",
        API_PORT: String(API_PORT),
      },
    },
    {
      command: "node scripts/serve-standalone.mjs",
      url: `${BASE_URL}/api/health`,
      // Mai riusare un server gia in piedi: terrebbe in vita una build vecchia
      // e i test girerebbero contro un codice diverso da quello appena scritto.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_URL,
        BETTER_AUTH_URL: BASE_URL,
        NODE_ENV: "production",
        PORT: String(PORT),
      },
    },
  ],
});
