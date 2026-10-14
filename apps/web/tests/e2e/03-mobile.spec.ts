import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Uso da telefono (criterio di accettazione: utilizzabile a 375 px).
 *
 * Qui non si verifica l'estetica ma due cose misurabili: le voci di
 * navigazione restano raggiungibili col pollice, e nessuna pagina scorre in
 * orizzontale.
 */

const VIEWPORT = { width: 375, height: 812 };

const user = {
  name: "Marco",
  email: `marco+${Date.now()}@example.test`,
  password: "password-da-telefono",
};

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("da telefono si completa l'onboarding e si legge la panoramica", async () => {
  await page.goto("/signup");
  await page.getByLabel("Come ti chiami").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL("**/onboarding");

  await page.getByLabel("Nome dell'household").fill("Casa di Marco");
  await page.getByRole("button", { name: "Avanti" }).click();

  await expect(page.getByRole("heading", { name: "Conti e Pocket" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).first().fill("Conto");
  await page.getByLabel("Saldo di oggi").first().fill("2.500,00");
  await page.getByRole("button", { name: "Avanti" }).click();

  await page.getByText("Parto da zero").click();
  await page.getByRole("button", { name: /Inizia a usare/i }).click();
  await page.waitForURL(/\/$/);

  await expect(page.getByText("Patrimonio totale")).toBeVisible();
});

test("la barra di navigazione in basso raggiunge le sezioni principali", async () => {
  await page.goto("/");

  const bottomNav = page.locator("nav").filter({ hasText: "Movimenti" }).last();
  await expect(bottomNav).toBeVisible();

  await bottomNav.getByRole("link", { name: "Conti" }).click();
  await page.waitForURL("**/accounts");
  await expect(page.getByRole("heading", { name: "Conti e Pocket" })).toBeVisible();

  await bottomNav.getByRole("link", { name: "Paga" }).click();
  await page.waitForURL("**/payday");
});

test("nessuna pagina scorre in orizzontale a 375 px", async () => {
  const paths = [
    "/",
    "/accounts",
    "/accounts/balances",
    "/accounts/new",
    "/payday",
    "/transactions",
    "/transactions/import",
    "/goals",
    "/templates",
    "/settings",
  ];

  for (const path of paths) {
    await page.goto(path);
    // Se il documento e piu largo della finestra, da telefono compare lo
    // scorrimento laterale: e il difetto che questo criterio vieta.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `la pagina ${path} scorre in orizzontale di ${overflow}px`).toBeLessThanOrEqual(
      1,
    );
  }
});
