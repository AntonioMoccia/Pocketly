/**
 * Errori di dominio, in un modulo senza dipendenze.
 *
 * Stanno qui e non accanto alle query perche li usano sia il server sia i
 * componenti client: importarli dal modulo delle query trascinerebbe il client
 * del database dentro il bundle del browser.
 */

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Operazione non consentita") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Il giorno di paga non si puo chiudere: manca qualcosa da assegnare o da spuntare. */
export class CannotCloseError extends Error {
  constructor(
    readonly reason: "unassigned" | "not_done",
    readonly detail: { unassignedCents?: number; pendingLines?: number },
  ) {
    super(`Giorno di paga non chiudibile: ${reason}`);
    this.name = "CannotCloseError";
  }
}
