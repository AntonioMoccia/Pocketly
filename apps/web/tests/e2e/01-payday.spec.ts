import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Il percorso che conta: da macchina pulita a giorno di paga chiuso.
 *
 * Verifica i criteri di accettazione della fase 1 che si possono misurare solo
 * sull'app vera: un Pocket non viene contato due volte, il wizard non si chiude
 * con "da assegnare" diverso da 0, lo storico del patrimonio si genera da solo.
 *
 * I passi condividono una sola sessione del browser, perche sono un percorso
 * unico: ogni test riparte da dove si era fermato il precedente.
 */

const user = {
  name: "Antonio",
  email: `antonio+${Date.now()}@example.test`,
  password: "una-password-lunga",
};

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ locale: "it-IT", timezoneId: "Europe/Rome" });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("il primo utente si registra e completa l'onboarding", async () => {
  await page.goto("/signup");
  await expect(page.getByText(/primo utente/i)).toBeVisible();

  await page.getByLabel("Come ti chiami").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Crea account" }).click();

  await page.waitForURL("**/onboarding");

  // Passo 1: household.
  await page.getByLabel("Nome dell'household").fill("Casa di Antonio");
  await page.getByRole("button", { name: "Avanti" }).click();

  // Passo 2: un conto e un Pocket dentro di esso.
  await expect(page.getByRole("heading", { name: "Conti e Pocket" })).toBeVisible();
  await page.getByLabel("Nome").first().fill("Conto operativo");
  await page.getByLabel("Istituto").first().fill("BPER");
  await page.getByLabel("Saldo di oggi").first().fill("1.000,00");

  await page.getByRole("button", { name: "+ Aggiungi Pocket" }).click();
  await page.getByLabel("Nome").nth(1).fill("Sfizi");
  await page.getByLabel("Saldo di oggi").nth(1).fill("150,00");
  await page.getByRole("button", { name: "Avanti" }).click();

  // Passo 3: nessun modello, si parte da zero.
  await expect(page.getByRole("heading", { name: /Come dividi/i })).toBeVisible();
  await page.getByText("Parto da zero").click();
  await page.getByRole("button", { name: /Inizia a usare/i }).click();

  await page.waitForURL(/\/$/);
});

test("un Pocket non viene contato due volte nel patrimonio", async () => {
  await page.goto("/");

  // 1000 sul conto + 150 nel Pocket = 1150, non 1300.
  // L'italiano non raggruppa i numeri a quattro cifre: si legge "1150".
  const card = page.locator("section").filter({ hasText: "Patrimonio totale" }).first();
  await expect(card).toContainText("1150");
  await expect(card).not.toContainText("1300");
});

test("il giorno di paga non si chiude con qualcosa ancora da assegnare", async () => {
  await page.goto("/payday");

  await page.getByLabel("Importo dell'entrata").fill("1.500,00");
  await page.getByRole("button", { name: "Inizia", exact: true }).click();
  await page.waitForURL(/\/payday\/[0-9a-f-]+/);

  const base = page.url().split("?")[0]!;
  await page.goto(`${base}?step=4`);

  // Senza righe resta tutto da assegnare: la chiusura e bloccata.
  await expect(page.getByRole("button", { name: /Chiudi il giorno di paga/i })).toBeDisabled();
});

test("con tutto assegnato e spuntato, il giorno di paga si chiude", async () => {
  await page.goto("/payday");
  await page.getByRole("link", { name: "Riprendi" }).click();
  await page.waitForURL(/\/payday\/[0-9a-f-]+/);
  const base = page.url().split("?")[0]!;

  // Una riga "resto" assorbe l'intera entrata.
  await page.goto(`${base}?step=2`);
  await page.getByRole("button", { name: /Aggiungi voce/i }).click();
  await page.getByPlaceholder("Nome della voce").last().fill("Resto del mese");
  await page.getByLabel("Tipo", { exact: true }).last().selectOption("remainder");

  await expect(page.getByText("Ogni euro ha un posto")).toBeVisible();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();

  // Si spunta il bonifico, poi si chiude. Il pulsante e un interruttore:
  // si preme solo se c'e ancora qualcosa da spuntare.
  await page.goto(`${base}?step=3`);
  await expect(page.getByText("Resto del mese")).toBeVisible();
  const markAll = page.getByRole("button", { name: /Segna tutto/i });
  if (await markAll.isVisible()) await markAll.click();
  await expect(page.getByRole("button", { name: /Togli tutte le spunte/i })).toBeVisible();

  await page.goto(`${base}?step=4`);
  const closeButton = page.getByRole("button", { name: /Chiudi il giorno di paga/i });
  await expect(closeButton).toBeEnabled();
  await closeButton.click();

  await expect(page.getByText(/Snapshot del patrimonio salvato/i)).toBeVisible();
});

test("la chiusura genera lo snapshot del patrimonio senza azioni manuali", async () => {
  await page.goto("/");
  const trend = page.locator("section").filter({ hasText: "Andamento" }).first();
  await expect(trend).toBeVisible();
  // Con uno snapshot salvato il grafico non mostra piu il messaggio di vuoto.
  await expect(trend).not.toContainText("Lo storico si popola");
});
