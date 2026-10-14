"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, runAction, type ActionState } from "@/lib/actions";
import { requireWritableContext } from "@/lib/session";
import { commitNotion, previewNotion, type NotionKind, type NotionPreview } from "@/server/notion-import";

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
    const context = await requireWritableContext();
    const kind = (String(formData.get("kind") ?? "accounts") as NotionKind) ?? "accounts";
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) return fail("import.noFile");
    if (file.size > 5_000_000) return fail("import.tooLarge");

    const preview = await previewNotion(
      context.household.id,
      kind,
      await file.text(),
      context.household.baseCurrency,
    );

    return { ...ok(), preview, kind };
  } catch (error) {
    if (error instanceof Error && error.message === "notionColumns") {
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
    const context = await requireWritableContext();
    const payload = String(formData.get("preview") ?? "");
    if (payload === "") return fail("errors.validation");

    const result = await commitNotion(context.household.id, JSON.parse(payload) as NotionPreview, {
      userId: context.user.id,
      baseCurrency: context.household.baseCurrency,
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
