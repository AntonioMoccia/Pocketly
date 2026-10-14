/**
 * Infrastruttura delle Server Action: traduzione degli errori in chiavi e
 * schemi di validazione riusabili.
 *
 * Lo stato (`ActionState`, `idleState`, `ok`, `fail`) vive in
 * `action-state.ts`, che i componenti client possono importare senza
 * trascinarsi dietro il database.
 */
import { z } from "zod";
import { fail, type ActionState } from "./action-state";
import { AuthorizationError, CannotCloseError, DomainError } from "./errors";
import { parseAmountToCents } from "./money";
import { isIsoDate } from "./date";

export { idleState, ok, fail } from "./action-state";
export type { ActionState } from "./action-state";

/**
 * Esegue il corpo di un'azione traducendo gli errori noti in chiavi.
 * Gli errori di Next per redirect e notFound devono risalire intatti.
 */
export async function runAction(body: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await body();
  } catch (error) {
    if (isNextControlFlow(error)) throw error;

    if (error instanceof AuthorizationError) return fail("errors.unauthorized");
    if (error instanceof CannotCloseError) {
      return error.reason === "unassigned"
        ? fail("payday.mustBeZero")
        : fail("payday.reasonNotDone", {
            messageValues: { count: error.detail.pendingLines ?? 0 },
          });
    }
    if (error instanceof DomainError) return fail(domainKey(error.code));
    if (error instanceof z.ZodError) {
      return { status: "error", messageKey: "errors.validation", fieldErrors: zodFields(error) };
    }

    // Il dettaglio resta nei log del server: a schermo non ci va mai.
    console.error("[action]", error);
    return fail("errors.serverError");
  }
}

function domainKey(code: string): string {
  const known: Record<string, string> = {
    invalidCurrency: "errors.invalidCurrency",
    accountNotFound: "errors.accountNotFound",
    cycleNotAllowed: "errors.cycleNotAllowed",
    pocketOfPocketCurrency: "errors.pocketOfPocketCurrency",
    lastOwner: "settings.lastOwner",
    inviteInvalid: "auth.inviteInvalid",
    notFound: "errors.notFound",
    validation: "errors.validation",
    importColumns: "import.columnsMissing",
    multiple_remainder: "templates.issues.multiple_remainder",
    missing_envelope: "templates.issues.missing_envelope",
    negative_value: "templates.issues.negative_value",
    no_lines: "templates.issues.no_lines",
  };
  return known[code] ?? "errors.serverError";
}

function zodFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** `redirect()` e `notFound()` di Next lanciano: vanno lasciati passare. */
function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest === "NEXT_NOT_FOUND")
  );
}

// ---------------------------------------------------------------------------
// Schemi riusabili
// ---------------------------------------------------------------------------

/** Importo digitato dall'utente, in unita minori della valuta indicata. */
export function amountSchema(currency = "EUR", options: { min?: number } = {}) {
  return z
    .string()
    .transform((value, ctx) => {
      const cents = parseAmountToCents(value, currency);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Importo non valido" });
        return z.NEVER;
      }
      return cents;
    })
    .refine((cents) => options.min === undefined || cents >= options.min, {
      message: "Importo non valido",
    });
}

export const isoDateSchema = z.string().refine(isIsoDate, { message: "Data non valida" });

/** `select` vuota significa "nessuno", non stringa vuota. */
export const nullableId = z
  .string()
  .trim()
  .transform((value) => (value === "" || value === "none" ? null : value));

export const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

/** Checkbox di un form HTML: presente significa vero. */
export const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.undefined()])
  .transform((value) => value === "on" || value === "true" || value === "1");
