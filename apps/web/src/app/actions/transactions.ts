"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { domainKey, fail, nullableId, ok, runAction, type ActionState } from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import { ApiError, api } from "@/lib/api";
import type { ImportPreview, ImportResult } from "@/data/import";

function refresh(transactionId?: string) {
  revalidatePath("/transactions");
  revalidatePath("/");
  if (transactionId) revalidatePath(`/transactions/${transactionId}`);
}

/**
 * Categorizza un movimento e, se richiesto, crea la regola proposta: e cosi
 * che la percentuale di categorizzazione automatica sale mese dopo mese.
 */
export async function categorizeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await requireWritableContext();
    const transactionId = String(formData.get("transactionId") ?? "");
    if (!transactionId) return fail("errors.notFound");

    const categoryId = nullableId.parse(formData.get("categoryId") ?? "");
    const envelopeRaw = formData.get("envelopeId");
    const envelopeId = envelopeRaw === null ? undefined : nullableId.parse(envelopeRaw);

    // Categoria, regola e applicazione della regola: una richiesta sola, la
    // sequenza la esegue l'API.
    await api.post(`/transactions/${encodeURIComponent(transactionId)}/categorize`, {
      categoryId,
      envelopeId,
      createRule: String(formData.get("createRule") ?? "") === "on",
    });

    refresh(transactionId);
    return ok();
  });
}

export async function ignoreTransactionAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const transactionId = String(formData.get("transactionId") ?? "");
  const ignored = String(formData.get("ignored") ?? "true") === "true";
  if (transactionId) {
    await api.post(`/transactions/${encodeURIComponent(transactionId)}/ignore`, { ignored });
  }
  refresh(transactionId);
}

/** Cancella il movimento per davvero: reimportando il file torna. */
export async function deleteTransactionAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const transactionId = String(formData.get("transactionId") ?? "");
  if (transactionId) await api.delete(`/transactions/${encodeURIComponent(transactionId)}`);
  refresh();
  redirect("/transactions");
}

/** Annulla un import: spariscono tutti i movimenti di quel file. */
export async function undoImportAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const batchId = String(formData.get("batchId") ?? "");
  if (batchId) await api.delete(`/imports/${encodeURIComponent(batchId)}`);
  revalidatePath("/transactions/import");
  refresh();
}

export async function detectTransfersAction(): Promise<void> {
  await requireWritableContext();
  await api.post("/transfers/detect");
  refresh();
}

export async function settleTransferAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const todoId = String(formData.get("todoId") ?? "");
  const done = String(formData.get("done") ?? "true") === "true";
  if (todoId) await api.post(`/transfer-todos/${encodeURIComponent(todoId)}/done`, { done });
  refresh();
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const ruleId = String(formData.get("ruleId") ?? "");
  if (ruleId) await api.delete(`/rules/${encodeURIComponent(ruleId)}`);
  revalidatePath("/settings");
  refresh();
}

export async function saveCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await requireWritableContext();
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(60),
        kind: z.enum(["expense", "income", "transfer"]),
        parentId: nullableId,
        defaultEnvelopeId: nullableId,
      })
      .parse({
        name: formData.get("name"),
        kind: formData.get("kind") ?? "expense",
        parentId: formData.get("parentId") ?? "",
        defaultEnvelopeId: formData.get("defaultEnvelopeId") ?? "",
      });

    const categoryId = String(formData.get("categoryId") ?? "") || undefined;
    const { id } = categoryId
      ? await api.put<{ id: string }>(`/categories/${encodeURIComponent(categoryId)}`, parsed)
      : await api.post<{ id: string }>("/categories", parsed);
    revalidatePath("/settings");
    refresh();
    return ok({ id });
  });
}

/**
 * I movimenti della categoria restano, senza categoria; le regole che la
 * assegnavano spariscono con lei, le sottocategorie salgono di livello.
 */
export async function deleteCategoryAction(formData: FormData): Promise<void> {
  await requireWritableContext();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (categoryId) await api.delete(`/categories/${encodeURIComponent(categoryId)}`);
  revalidatePath("/settings");
  refresh();
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * L'anteprima non scrive nulla. Il file resta nel form fino alla conferma:
 * nessuna copia sul disco del server, che su un'app self-hosted e un file in
 * meno da proteggere.
 */
export async function previewImportAction(
  _previous: ActionState & { preview?: unknown },
  formData: FormData,
): Promise<ActionState & { preview?: unknown; filename?: string; accountId?: string }> {
  try {
    await requireWritableContext();
    const accountId = String(formData.get("accountId") ?? "");
    const file = formData.get("file");
    if (!accountId) return fail("errors.validation");
    if (!(file instanceof File) || file.size === 0) return fail("import.noFile");
    if (file.size > 5_000_000) return fail("import.tooLarge");

    const text = await file.text();
    const preview = await api.post<ImportPreview>("/imports/preview", {
      accountId,
      text,
      delimiter: String(formData.get("delimiter") ?? "") || undefined,
      dateFormat: String(formData.get("dateFormat") ?? "") || undefined,
    });

    return { ...ok(), preview, filename: file.name, accountId };
  } catch (error) {
    // Colonne mancanti, ruolo di sola lettura, conto sparito: stessi messaggi
    // delle altre azioni.
    if (error instanceof ApiError) {
      return error.status === 401 || error.code === "unauthorized" || error.code === "noHousehold"
        ? fail("errors.unauthorized")
        : fail(domainKey(error.code));
    }
    console.error("[import.preview]", error);
    return fail("errors.serverError");
  }
}

export async function commitImportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let batchId: string | null = null;

  const result = await runAction(async () => {
    await requireWritableContext();
    const accountId = String(formData.get("accountId") ?? "");
    const filename = String(formData.get("filename") ?? "estratto.csv");
    const payload = String(formData.get("preview") ?? "");
    if (!accountId || payload === "") return fail("errors.validation");

    const preview = JSON.parse(payload) as ImportPreview;
    const outcome = await api.post<ImportResult>("/imports", { accountId, filename, preview });
    batchId = outcome.batchId;

    refresh();
    return ok({
      messageKey: "import.done",
      messageValues: { imported: outcome.imported, skipped: outcome.skipped },
    });
  });

  if (result.status === "success" && batchId) redirect("/transactions?imported=1");
  return result;
}
