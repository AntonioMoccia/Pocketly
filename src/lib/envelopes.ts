/**
 * Buste: l'unita del budget.
 *
 * Due assi indipendenti su ogni spesa. La categoria dice *cosa* hai comprato
 * (analisi), la busta dice *con quali soldi* l'hai pagata (budget).
 *
 * Due nature di busta:
 *  - reale: corrisponde a un conto o a un Pocket, e il disponibile e il saldo
 *    vero di quel conto. Non si puo barare: i soldi ci sono o non ci sono;
 *  - virtuale: vive dentro un conto reale, e il disponibile si calcola come
 *    riporto + assegnato + ricevuti - ceduti - speso.
 *
 * La regola che tiene insieme il sistema: le buste virtuali si spostano con un
 * clic, i soldi reali no. Ogni volta che le due cose divergono nasce un
 * giroconto da fare, altrimenti i saldi mentono.
 */

export type EnvelopeKind = "real" | "virtual";
export type LeftoverPolicy = "accumulate" | "sweep";

export type EnvelopeInput = {
  id: string;
  name: string;
  kind: EnvelopeKind;
  /** Conto che tiene i soldi. */
  accountId: string;
  leftoverPolicy: LeftoverPolicy;
  sweepToEnvelopeId: string | null;
  color: number;
  archived: boolean;
};

export type EnvelopeMonthInput = {
  /** Riporto dal mese precedente; 0 se la politica e "svuota". */
  carryOverCents: number;
  /** Assegnato dalle ripartizioni del mese. */
  assignedCents: number;
  /** Spostamenti ricevuti da altre buste. */
  movedInCents: number;
  /** Spostamenti ceduti ad altre buste. */
  movedOutCents: number;
  /** Speso nel mese, come numero positivo. */
  spentCents: number;
  /** Saldo reale del conto o Pocket, solo per le buste reali. */
  realBalanceCents?: number;
};

export type EnvelopeState = EnvelopeInput &
  EnvelopeMonthInput & {
    /** Quanto resta da spendere. */
    availableCents: number;
    /** Quanto il piano prevede per il mese, riporto incluso. */
    budgetedCents: number;
    overspent: boolean;
    overspentByCents: number;
    /** Quota di budget gia consumata, tra 0 e 1 (oltre resta 1). */
    usedRatio: number;
  };

/**
 * Disponibile di una busta.
 *
 * Per una busta reale il disponibile e il saldo del Pocket: se il saldo dice
 * 150, quello c'e, qualunque cosa raccontino le assegnazioni. Per una virtuale
 * si calcola, perche dentro il conto i soldi di buste diverse sono mescolati.
 */
export function computeEnvelopeState(
  envelope: EnvelopeInput,
  month: EnvelopeMonthInput,
): EnvelopeState {
  const budgeted =
    month.carryOverCents + month.assignedCents + month.movedInCents - month.movedOutCents;

  const available =
    envelope.kind === "real" && month.realBalanceCents !== undefined
      ? month.realBalanceCents
      : budgeted - month.spentCents;

  const overspentBy = available < 0 ? -available : 0;

  return {
    ...envelope,
    ...month,
    budgetedCents: budgeted,
    availableCents: available,
    overspent: available < 0,
    overspentByCents: overspentBy,
    usedRatio: budgeted > 0 ? Math.min(1, month.spentCents / budgeted) : month.spentCents > 0 ? 1 : 0,
  };
}

/**
 * Riporto verso il mese successivo: con politica "svuota" non resta nulla,
 * l'avanzo va nella busta di destinazione.
 */
export function carryOverFor(state: EnvelopeState): number {
  if (state.leftoverPolicy === "sweep") return 0;
  return state.availableCents;
}

export type SweepResult = {
  fromEnvelopeId: string;
  toEnvelopeId: string;
  amountCents: number;
};

/**
 * Avanzi di fine mese: ogni busta con politica "svuota" e un avanzo positivo
 * cede l'avanzo alla busta di destinazione. Le buste in rosso non svuotano
 * nulla: uno sforamento si copre, non si sposta.
 */
export function planSweeps(states: EnvelopeState[]): SweepResult[] {
  const out: SweepResult[] = [];
  for (const state of states) {
    if (state.leftoverPolicy !== "sweep") continue;
    if (!state.sweepToEnvelopeId) continue;
    if (state.sweepToEnvelopeId === state.id) continue;
    if (state.availableCents <= 0) continue;
    out.push({
      fromEnvelopeId: state.id,
      toEnvelopeId: state.sweepToEnvelopeId,
      amountCents: state.availableCents,
    });
  }
  return out;
}

export type CoverageOption = {
  envelopeId: string;
  name: string;
  availableCents: number;
  kind: EnvelopeKind;
  /** Serve un giroconto reale: le due buste stanno su conti diversi. */
  needsTransfer: boolean;
  fromAccountId: string;
  toAccountId: string;
  /** Sconsigliata come fonte, ma non vietata. */
  discouraged: boolean;
};

/**
 * Buste da cui coprire uno sforamento, in ordine di comodita: prima quelle
 * sullo stesso conto (nessun bonifico da fare), poi per disponibile. Le buste
 * marcate come cuscinetto scendono in fondo: svuotare il fondo emergenza per
 * una pizza e una decisione, non un suggerimento.
 */
export function coverageOptions(
  target: EnvelopeState,
  candidates: EnvelopeState[],
  options: { discouragedIds?: string[] } = {},
): CoverageOption[] {
  const discouraged = new Set(options.discouragedIds ?? []);

  return candidates
    .filter((candidate) => candidate.id !== target.id)
    .filter((candidate) => !candidate.archived)
    .filter((candidate) => candidate.availableCents > 0)
    .map((candidate) => ({
      envelopeId: candidate.id,
      name: candidate.name,
      availableCents: candidate.availableCents,
      kind: candidate.kind,
      needsTransfer: candidate.accountId !== target.accountId,
      fromAccountId: candidate.accountId,
      toAccountId: target.accountId,
      discouraged: discouraged.has(candidate.id),
    }))
    .sort((a, b) => {
      if (a.discouraged !== b.discouraged) return a.discouraged ? 1 : -1;
      if (a.needsTransfer !== b.needsTransfer) return a.needsTransfer ? 1 : -1;
      return b.availableCents - a.availableCents;
    });
}

export type AccountConsistency = {
  accountId: string;
  /** Somma del disponibile delle buste virtuali sul conto. */
  envelopesCents: number;
  /** Saldo reale del conto. */
  balanceCents: number;
  /** Quanto del saldo non e assegnato a nessuna busta. */
  unassignedCents: number;
  /** Vero quando buste + non assegnato non tornano col saldo. */
  inconsistent: boolean;
  differenceCents: number;
};

/**
 * Coerenza di un conto: somma delle buste virtuali + non assegnato = saldo
 * reale. Quando non torna, c'e una spesa non importata, un interesse o una
 * commissione: l'app mostra la differenza invece di nasconderla.
 */
export function checkAccountConsistency(
  accountId: string,
  balanceCents: number,
  virtualEnvelopes: EnvelopeState[],
  declaredUnassignedCents: number | null = null,
): AccountConsistency {
  const envelopesTotal = virtualEnvelopes
    .filter((envelope) => envelope.accountId === accountId && envelope.kind === "virtual")
    .reduce((sum, envelope) => sum + envelope.availableCents, 0);

  const unassigned =
    declaredUnassignedCents === null ? balanceCents - envelopesTotal : declaredUnassignedCents;
  const difference = balanceCents - (envelopesTotal + unassigned);

  return {
    accountId,
    envelopesCents: envelopesTotal,
    balanceCents,
    unassignedCents: unassigned,
    inconsistent: difference !== 0,
    differenceCents: difference,
  };
}

/**
 * Giroconto necessario perche una spesa e stata pagata dal conto "sbagliato":
 * la busta che la assorbe sta su un altro conto. Senza il giroconto il saldo
 * del Pocket resterebbe alto e quello del conto basso.
 */
export function transferForMisplacedExpense(
  paidFromAccountId: string,
  envelope: EnvelopeInput,
  amountCents: number,
): { fromAccountId: string; toAccountId: string; amountCents: number } | null {
  if (amountCents <= 0) return null;
  if (envelope.accountId === paidFromAccountId) return null;
  // I soldi sono usciti dal conto di pagamento ma la busta sta altrove:
  // quel conto va rimborsato dalla busta.
  return {
    fromAccountId: envelope.accountId,
    toAccountId: paidFromAccountId,
    amountCents,
  };
}

/** Primo giorno del mese di una data, come chiave di periodo. */
export function monthKey(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
