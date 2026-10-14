"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, runAction, type ActionState } from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import { api, ApiError } from "@/lib/api";

type NotionKind = "accounts" | "contributions";

// L'anteprima torna al client come dato opaco: il componente la rimanda
// indietro invariata alla conferma, senza doverne conoscere il tipo esatto.
type PreviewState = ActionState & { preview?: unknown; kind?: NotionKind };

/**
 * Anteprima dell'import da Notion: legge il file e mostra cosa succederebbe.
 * Non scrive nulla finche l'utente non conferma.
 */
export async function previewNotionAction(
  _previous: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  try {
    await requireWritableContext();
    const kind: NotionKind =
      String(formData.get("kind") ?? "accounts") === "contributions" ? "contributions" : "accounts";
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) return fail("import.noFile");
    if (file.size > 5_000_000) return fail("import.tooLarge");

    // Il CSV viaggia come testo: colonne e importi li riconosce l'API.
    const preview = await api.post<unknown>("/notion/preview", {
      kind,
      text: await file.text(),
    });

    return { ...ok(), preview, kind };
  } catch (error) {
    if (error instanceof ApiError && error.code === "notionColumns") {
      return fail("notion.columnsMissing");
    }
    console.error("[notion.preview]", error);
    return fail("errors.serverError");
  }
}

export async function commitNotionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await requireWritableContext();
    const payload = String(formData.get("preview") ?? "");
    if (payload === "") return fail("errors.validation");

    const result = await api.post<{ created: number; skipped: number }>("/notion/commit", {
      preview: JSON.parse(payload) as unknown,
    });

    revalidatePath("/accounts");
    revalidatePath("/goals");
    revalidatePath("/");

    return ok({
      messageKey: "notion.done",
      messageValues: { created: result.created, skipped: result.skipped },
    });
  });
}
