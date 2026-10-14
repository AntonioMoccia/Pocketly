/**
 * Tipi dell'import CSV: l'anteprima fa andata e ritorno tra API e browser.
 */
import { api } from "@/lib/api";
import type { listImportBatches as serverListImportBatches } from "@api/data/import";

export type { ImportPreview, ImportResult, PreviewRow } from "@api/data/import";

export type ImportBatch = Awaited<ReturnType<typeof serverListImportBatches>>[number];

export function listImportBatches() {
  return api.get<ImportBatch[]>("/imports");
}
