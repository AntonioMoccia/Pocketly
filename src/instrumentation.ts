/**
 * Avvio dei job pianificati insieme al server.
 *
 * Next chiama `register()` una volta per processo: e il posto giusto per far
 * partire la coda, senza un secondo container da gestire nel self-hosting.
 */
export async function register() {
  // Solo nel runtime Node: sull'edge non esistono ne socket ne Postgres.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_JOBS === "true") return;
  // Durante la build Next importa i moduli per raccogliere le pagine: la coda
  // non deve partire li, o ogni build aprirebbe una connessione.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startJobs } = await import("./worker/jobs");
  await startJobs();
}
