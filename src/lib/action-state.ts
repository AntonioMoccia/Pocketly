/**
 * Stato delle Server Action, condiviso con i componenti client.
 *
 * Questo modulo non importa nulla del server: lo usano anche i form nel
 * browser, e deve restare leggero e senza effetti collaterali.
 *
 * Le azioni non restituiscono messaggi gia tradotti ma chiavi: la traduzione
 * avviene a schermo, nella lingua di chi guarda.
 */

export type ActionState = {
  status: "idle" | "success" | "error";
  /** Chiave di traduzione del messaggio, es. "errors.invalidCurrency". */
  messageKey?: string;
  /** Valori per i segnaposto del messaggio. */
  messageValues?: Record<string, string | number>;
  fieldErrors?: Record<string, string>;
  /** Id della risorsa creata, per i reindirizzamenti. */
  id?: string;
};

export const idleState: ActionState = { status: "idle" };

export function ok(extra: Partial<ActionState> = {}): ActionState {
  return { status: "success", ...extra };
}

export function fail(messageKey: string, extra: Partial<ActionState> = {}): ActionState {
  return { status: "error", messageKey, ...extra };
}
