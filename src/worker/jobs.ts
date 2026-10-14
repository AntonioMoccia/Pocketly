/**
 * Job pianificati, nello stesso processo del server.
 *
 * pg-boss usa Postgres come coda: niente Redis, un servizio in meno da
 * installare e da mettere in sicurezza su un self-hosting. Girando dentro
 * l'applicazione, i job condividono il codice di dominio invece di
 * riscriverlo: lo snapshot del patrimonio e lo stesso che calcola la
 * dashboard.
 *
 * Job:
 *  - tassi BCE, ogni giorno feriale (F1.13);
 *  - snapshot del patrimonio, il primo di ogni mese (F1.12);
 *  - abbinamento dei giroconti e spunta dei bonifici, ogni sei ore (F1.5.7).
 */
import { PgBoss } from "pg-boss";
import { db } from "@/db";
import { households } from "@/db/schema";
import { hasAnyRate, refreshRates } from "@/server/fx";
import { saveNetWorthSnapshot } from "@/server/networth";
import { detectTransfers, settleTransferTodos } from "@/server/transactions";

const QUEUES = {
  fx: "fx-rates",
  snapshot: "net-worth-snapshot",
  transfers: "match-transfers",
} as const;

let started: Promise<void> | null = null;

/** Avvia i job una volta sola per processo, anche se chiamata piu volte. */
export function startJobs(): Promise<void> {
  started ??= start().catch((error) => {
    // Un worker che non parte non deve impedire all'app di servire: i job si
    // possono sempre lanciare a mano dalle impostazioni.
    console.error("[jobs] avvio fallito:", error);
  });
  return started;
}

async function start(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[jobs] DATABASE_URL non impostata: job non avviati.");
    return;
  }

  const timezone = process.env.TZ ?? "Europe/Rome";
  const boss = new PgBoss({ connectionString: url, schema: "pgboss" });
  boss.on("error", (error: unknown) => console.error("[pg-boss]", error));
  await boss.start();

  for (const queue of Object.values(QUEUES)) {
    await boss.createQueue(queue);
  }

  await boss.work(QUEUES.fx, async () => {
    const result = await refreshRates();
    console.log(`[jobs] tassi: ${result.written} righe, ultimo giorno ${result.latestDate ?? "n/d"}`);
  });

  await boss.work(QUEUES.snapshot, async () => {
    const rows = await db
      .select({ id: households.id, baseCurrency: households.baseCurrency })
      .from(households);
    for (const row of rows) {
      await saveNetWorthSnapshot(row.id, row.baseCurrency.trim());
    }
    console.log(`[jobs] snapshot salvati per ${rows.length} household`);
  });

  await boss.work(QUEUES.transfers, async () => {
    const rows = await db.select({ id: households.id }).from(households);
    let matched = 0;
    for (const row of rows) {
      matched += await detectTransfers(row.id);
      await settleTransferTodos(row.id);
    }
    console.log(`[jobs] ${matched} giroconti abbinati`);
  });

  // I tassi BCE escono intorno alle 16:00 CET nei giorni feriali.
  await boss.schedule(QUEUES.fx, "30 16 * * 1-5", undefined, { tz: timezone });
  await boss.schedule(QUEUES.snapshot, "5 1 1 * *", undefined, { tz: timezone });
  await boss.schedule(QUEUES.transfers, "0 */6 * * *", undefined, { tz: timezone });

  // Al primo avvio i cambi servono subito: senza, un saldo in valuta diversa
  // resterebbe fuori dai totali fino al giorno dopo.
  if (!(await hasAnyRate())) {
    await boss.send(QUEUES.fx, {});
  }

  const stop = async () => {
    await boss.stop({ graceful: true }).catch(() => {});
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  console.log("[jobs] tassi, snapshot e giroconti pianificati.");
}
