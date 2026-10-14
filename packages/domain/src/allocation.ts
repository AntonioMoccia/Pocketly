/**
 * Motore di ripartizione: dato un importo in entrata e le righe di un modello,
 * calcola quanto va su ogni conto di destinazione.
 *
 * Le righe si applicano in ordine di priorita. Una riga "resto" assorbe la
 * differenza, cosi il totale assegnato combacia sempre con l'entrata; senza
 * riga resto, l'eventuale scarto resta visibile come "da assegnare" e il
 * giorno di paga non si puo chiudere (criterio di accettazione F1.7).
 */
import { applyBps, distribute, sum } from "./money";

export type AllocationKind = "fixed" | "percent" | "remainder";
export type PercentBasis = "gross" | "remaining";

export type AllocationLineInput = {
  id: string;
  label: string;
  kind: AllocationKind;
  /** Busta di destinazione; il conto si ricava dalla busta. */
  envelopeId: string | null;
  /** Importo in unita minori, usato da `kind: "fixed"`. */
  amountCents: number;
  /** Punti base: 10000 = 100%, usato da `kind: "percent"`. */
  percentBps: number;
  /** Base della percentuale: lordo dell'entrata o quanto resta a quel punto. */
  percentBasis: PercentBasis;
  priority: number;
};

export type PlannedLine = AllocationLineInput & { plannedCents: number };

export type AllocationPlan = {
  lines: PlannedLine[];
  incomeCents: number;
  assignedCents: number;
  /** Quanto resta da assegnare: deve essere 0 per chiudere il giorno di paga. */
  unassignedCents: number;
  overAllocated: boolean;
};

export function defaultLine(partial: Partial<AllocationLineInput> = {}): AllocationLineInput {
  return {
    id: partial.id ?? crypto.randomUUID(),
    label: partial.label ?? "",
    kind: partial.kind ?? "fixed",
    envelopeId: partial.envelopeId ?? null,
    amountCents: partial.amountCents ?? 0,
    percentBps: partial.percentBps ?? 0,
    percentBasis: partial.percentBasis ?? "gross",
    priority: partial.priority ?? 0,
  };
}

function byPriority(lines: AllocationLineInput[]): AllocationLineInput[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.priority - b.line.priority || a.index - b.index)
    .map(({ line }) => line);
}

export function computeAllocation(
  incomeCents: number,
  lines: AllocationLineInput[],
): AllocationPlan {
  const ordered = byPriority(lines);
  const planned = new Map<string, number>();
  let assigned = 0;

  for (const line of ordered) {
    if (line.kind === "remainder") continue;
    let amount: number;
    if (line.kind === "fixed") {
      amount = line.amountCents;
    } else {
      const basis = line.percentBasis === "remaining" ? incomeCents - assigned : incomeCents;
      amount = applyBps(basis, line.percentBps);
    }
    planned.set(line.id, amount);
    assigned += amount;
  }

  const remainderLines = ordered.filter((l) => l.kind === "remainder");
  const leftover = incomeCents - assigned;
  if (remainderLines.length > 0) {
    // Con piu righe resto (dato non valido ma possibile) si ripartisce in parti
    // uguali senza perdere centesimi, per non far sparire denaro.
    const shares = distribute(
      leftover,
      remainderLines.map(() => 1),
    );
    remainderLines.forEach((line, i) => {
      const share = shares[i] ?? 0;
      planned.set(line.id, share);
      assigned += share;
    });
  }

  const resultLines: PlannedLine[] = lines.map((line) => ({
    ...line,
    plannedCents: planned.get(line.id) ?? 0,
  }));

  return {
    lines: resultLines,
    incomeCents,
    assignedCents: assigned,
    unassignedCents: incomeCents - assigned,
    overAllocated: assigned > incomeCents,
  };
}

export type TemplateIssueCode =
  | "multiple_remainder"
  | "missing_envelope"
  | "negative_value"
  | "percent_over_100"
  | "empty_label"
  | "no_lines";

export type TemplateIssue = {
  level: "error" | "warning";
  code: TemplateIssueCode;
  lineId?: string;
};

/** Controlli su un modello di ripartizione, indipendenti dall'importo. */
export function validateTemplate(lines: AllocationLineInput[]): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  if (lines.length === 0) issues.push({ level: "error", code: "no_lines" });

  const remainders = lines.filter((l) => l.kind === "remainder");
  if (remainders.length > 1) {
    for (const line of remainders.slice(1)) {
      issues.push({ level: "error", code: "multiple_remainder", lineId: line.id });
    }
  }

  for (const line of lines) {
    if (!line.envelopeId)
      issues.push({ level: "error", code: "missing_envelope", lineId: line.id });
    if (line.label.trim() === "")
      issues.push({ level: "warning", code: "empty_label", lineId: line.id });
    if (line.kind === "fixed" && line.amountCents < 0)
      issues.push({ level: "error", code: "negative_value", lineId: line.id });
    if (line.kind === "percent" && (line.percentBps < 0 || line.percentBps > 10_000))
      issues.push({ level: "error", code: "negative_value", lineId: line.id });
  }

  const grossPercent = sum(
    lines.filter((l) => l.kind === "percent" && l.percentBasis === "gross").map((l) => l.percentBps),
  );
  if (grossPercent > 10_000) issues.push({ level: "warning", code: "percent_over_100" });

  return issues;
}

/** Il giorno di paga si chiude solo con "da assegnare" a 0 e ogni riga spuntata. */
export function canClosePayday(
  plan: AllocationPlan,
  doneByLineId: Record<string, boolean>,
): boolean {
  if (plan.unassignedCents !== 0) return false;
  return plan.lines.every((line) => line.plannedCents === 0 || doneByLineId[line.id] === true);
}
