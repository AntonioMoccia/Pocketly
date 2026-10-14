import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Import di un estratto conto (fase 1.5).
 *
 * Il criterio di accettazione che conta: lo stesso CSV importato due volte non
 * crea doppioni. E la differenza tra un'app a cui si puo affidare il saldo e
 * una da ricontrollare a mano ogni volta.
 */

const CSV = path.join(__dirname, "fixtures", "revolut-ottobre.csv");

const user = {
  name: "Giulia",
  email: `giulia+${Date.now()}@example.test`,
  password: "un-altra-password",
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

test("prepara un household con un conto", async () => {
  await page.goto("/signup");
  await page.getByLabel("Come ti chiami").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Crea account" }).click();
  await page.waitForURL("**/onboarding");

  await page.getByLabel("Nome dell'household").fill("Casa di Giulia");
  await page.getByRole("button", { name: "Avanti" }).click();

  // Senza questa attesa il campo "Nome" verrebbe cercato mentre e ancora a
  // schermo "Nome dell'household", che lo contiene come sottostringa.
  await expect(page.getByRole("heading", { name: "Conti e Pocket" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).first().fill("Saldo principale");
  await page.getByLabel("Istituto").first().fill("Revolut");
  await page.getByLabel("Saldo di oggi").first().fill("392,00");
  await page.getByRole("button", { name: "Avanti" }).click();

  await page.getByText("Parto da zero").click();
  await page.getByRole("button", { name: /Inizia a usare/i }).click();
  await page.waitForURL(/\/$/);
});

test("l'anteprima legge il file e riconosce le colonne di Revolut", async () => {
  await page.goto("/transactions/import");

  await page.getByLabel("File CSV").setInputFiles(CSV);
  await page.getByRole("button", { name: /Leggi il file/i }).click();

  // Otto righe nel file, tutte nuove al primo import.
  const summary = page.locator("section").filter({ hasText: "Righe nel file" }).first();
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("8");

  // Le colonne di Revolut: vale la data di contabilizzazione, non quella di avvio.
  await expect(page.getByText(/Data: Completed Date/)).toBeVisible();
});

test("il primo import crea i movimenti", async () => {
  await page.getByRole("button", { name: /Importa 8 movimenti/i }).click();
  await page.waitForURL(/\/transactions/);

  await expect(page.getByText("Pizzeria Da Gennaro")).toBeVisible();
  await expect(page.getByText("Conad City")).toBeVisible();
  // L'entrata si riconosce dal segno.
  await expect(page.getByText("Bonifico stipendio")).toBeVisible();
});

test("lo stesso file importato di nuovo non crea doppioni", async () => {
  await page.goto("/transactions/import");
  await page.getByLabel("File CSV").setInputFiles(CSV);
  await page.getByRole("button", { name: /Leggi il file/i }).click();

  const summary = page.locator("section").filter({ hasText: "Righe nel file" }).first();
  await expect(summary).toContainText(/Gi.? importate, saltate/);
  // Nessun movimento nuovo: il pulsante di import si disattiva.
  await expect(page.getByRole("button", { name: /Nessun movimento nuovo/i })).toBeDisabled();

  // E la lista resta con una sola Pizzeria.
  await page.goto("/transactions");
  await expect(page.getByText("Pizzeria Da Gennaro")).toHaveCount(1);
});

test("categorizzare un movimento propone la regola e la applica", async () => {
  await page.goto("/transactions?filter=uncategorized");
  await page.getByText("Pizzeria Da Gennaro").click();
  await page.waitForURL(/\/transactions\/[0-9a-f-]+/);

  // Si sceglie una categoria: la regola proposta e gia spuntata.
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Ristoranti" });
  await expect(page.getByText(/Crea una regola/i)).toBeVisible();

  await page.getByRole("button", { name: /Salva/i }).first().click();
  await page.waitForLoadState("networkidle");

  await page.goto("/transactions");
  await expect(page.getByText("Ristoranti").first()).toBeVisible();
});
