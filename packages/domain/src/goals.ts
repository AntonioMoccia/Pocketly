/**
 * Obiettivi di risparmio e registro dei versamenti.
 *
 * L'avanzamento di un obiettivo e la somma dei saldi dei conti collegati: non
 * si tiene un contatore a parte, cosi il dato non puo divergere dai saldi reali.
 */
import { sum } from "./money";

export type GoalProgress = {
  targetCents: number;
  currentCents: number;
  /** Avanzamento tra 0 e 1; oltre il target resta 1 per le barre. */
  ratio: number;
  remainingCents: number;
  reached: boolean;
  /** Mesi interi residui alla scadenza; null senza scadenza. */
  monthsLeft: number | null;
  /** Quanto accantonare al mese per arrivare in tempo; null senza scadenza. */
  perMonthCents: number | null;
  /** La scadenza e passata con l'obiettivo non raggiunto. */
  overdue: boolean;
};

/** Mesi interi tra due date, arrotondati per eccesso se restano giorni. */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const dayAdjust = to.getUTCDate() >= from.getUTCDate() ? 0 : -1;
  return months + dayAdjust;
}

export function computeGoalProgress(
  targetCents: number,
  currentCents: number,
  deadline: Date | null,
  today: Date = new Date(),
): GoalProgress {
  const remaining = Math.max(0, targetCents - currentCents);
  const reached = targetCents > 0 && currentCents >= targetCents;
  const ratio = targetCents <= 0 ? (reached ? 1 : 0) : Math.min(1, Math.max(0, currentCents / targetCents));

  let monthsLeft: number | null = null;
  let perMonth: number | null = null;
  let overdue = false;

  if (deadline) {
    const months = monthsBetween(today, deadline);
    monthsLeft = Math.max(0, months);
    overdue = !reached && deadline.getTime() < startOfDay(today).getTime();
    // A scadenza raggiunta o passata serve tutto subito: un solo versamento.
    perMonth = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, monthsLeft));
  }

  return {
    targetCents,
    currentCents,
    ratio,
    remainingCents: remaining,
    reached,
    monthsLeft,
    perMonthCents: perMonth,
    overdue,
  };
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export type ContributionRow = {
  date: string;
  amountCents: number;
  kind: "deposit" | "withdrawal";
};

export type InvestmentSummary = {
  /** Capitale versato netto: versamenti meno rimborsi. */
  investedCents: number;
  /** Valore attuale inserito a mano (fase 1) o calcolato dai prezzi (fase 3). */
  valueCents: number;
  gainCents: number;
  /** Rendimento semplice sul capitale versato; null se non c'e capitale. */
  returnRatio: number | null;
};

/** Capitale versato vs valore di mercato per un conto di investimento. */
export function summarizeInvestment(
  contributions: ContributionRow[],
  currentValueCents: number | null,
): InvestmentSummary {
  const invested = sum(
    contributions.map((c) => (c.kind === "withdrawal" ? -c.amountCents : c.amountCents)),
  );
  const value = currentValueCents ?? invested;
  const gain = value - invested;
  return {
    investedCents: invested,
    valueCents: value,
    gainCents: gain,
    returnRatio: invested > 0 ? gain / invested : null,
  };
}
