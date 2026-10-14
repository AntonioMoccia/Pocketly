"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, nullableId, ok, runAction, type ActionState } from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import {
  applyRulesToPending,
  categorizeTransaction,
  createRule,
  deleteRule,
  detectTransfers,
  ruleSuggestionFor,
  setTransactionIgnored,
  setTransferTodoDone,
} from "@/server/transactions";
import { commitImport, previewImport } from "@/server/import";
import { saveCategory } from "@/server/categories";

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
    const context = await requireWritableContext();
    const transactionId = String(formData.get("transactionId") ?? "");
    if (!transactionId) return fail("errors.notFound");

    const categoryId = nullableId.parse(formData.get("categoryId") ?? "");
    const envelopeRaw = formData.get("envelopeId");
    const envelopeId = envelopeRaw === null ? undefined : nullableId.parse(envelopeRaw);

    await categorizeTransaction(context.household.id, transactionId, { categoryId, envelopeId });

    if (String(formData.get("createRule") ?? "") === "on" && categoryId) {
      const suggestion = await ruleSuggestionFor(
        context.household.id,
        transactionId,
        categoryId,
        envelopeId ?? null,
      );
      if (suggestion) {
        const ruleId = await createRule(context.household.id, suggestion.rule);
        await applyRulesToPending(context.household.id, { onlyRuleId: ruleId });
      }
    }

    refresh(transactionId);
    return ok();
  });
}

export async function ignoreTransactionAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const transactionId = String(formData.get("transactionId") ?? "");
  const ignored = String(formData.get("ignored") ?? "true") === "true";
  if (transactionId) await setTransactionIgnored(context.household.id, transactionId, ignored);
  refresh(transactionId);
}

export async function detectTransfersAction(): Promise<void> {
  const context = await requireWritableContext();
  await detectTransfers(context.household.id);
  refresh();
}

export async function settleTransferAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const todoId = String(formData.get("todoId") ?? "");
  const done = String(formData.get("done") ?? "true") === "true";
  if (todoId) await setTransferTodoDone(context.household.id, todoId, done);
  refresh();
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const context = await requireWritableContext();
  const ruleId = String(formData.get("ruleId") ?? "");
  if (ruleId) await deleteRule(context.household.id, ruleId);
  revalidatePath("/settings");
  refresh();
}

export async function saveCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requireWritableContext();
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
    const id = await saveCategory(context.household.id, parsed, categoryId);
    revalidatePath("/settings");
    refresh();
    return ok({ id });
  });
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
    const context = await requireWritableContext();
    const accountId = String(formData.get("accountId") ?? "");
    const file = formData.get("file");
    if (!accountId) return fail("errors.validation");
    if (!(file instanceof File) || file.size === 0) return fail("import.noFile");
    if (file.size > 5_000_000) return fail("import.tooLarge");

    const text = await file.text();
    const preview = await previewImport(context.household.id, accountId, text, {
      delimiter: String(formData.get("delimiter") ?? "") || undefined,
      dateFormat: String(formData.get("dateFormat") ?? "") || undefined,
    });

    return { ...ok(), preview, filename: file.name, accountId };
  } catch (error) {
    if (error instanceof Error && error.message === "importColumns") {
      return fail("import.columnsMissing");
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
    const context = await requireWritableContext();
    const accountId = String(formData.get("accountId") ?? "");
    const filename = String(formData.get("filename") ?? "estratto.csv");
    const payload = String(formData.get("preview") ?? "");
    if (!accountId || payload === "") return fail("errors.validation");

    const preview = JSON.parse(payload);
    const outcome = await commitImport(
      context.household.id,
      accountId,
      filename,
      preview,
      context.user.id,
    );
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
