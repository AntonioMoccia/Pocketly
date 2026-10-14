/**
 * Regole di categorizzazione e abbinamento dei giroconti.
 *
 * Il criterio di accettazione della fase 1.5 e misurabile: al secondo mese
 * almeno l'80% dei movimenti deve risultare categorizzato senza intervento. Le
 * regole nascono dalle correzioni manuali, cosi la percentuale sale da sola
 * mentre l'utente usa l'app.
 */

export type RuleField = "description" | "counterparty" | "amount";
export type RuleOperator = "contains" | "equals" | "starts_with" | "greater_than" | "less_than";

export type Rule = {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  categoryId: string | null;
  envelopeId: string | null;
  priority: number;
  enabled: boolean;
};

export type MatchableTransaction = {
  description: string;
  counterparty: string | null;
  amountCents: number;
};

/** Normalizza per il confronto: senza accenti, senza doppi spazi, minuscolo. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function ruleMatches(rule: Rule, transaction: MatchableTransaction): boolean {
  if (!rule.enabled) return false;

  if (rule.field === "amount") {
    const threshold = Number(rule.value.replace(",", "."));
    if (!Number.isFinite(threshold)) return false;
    // Le soglie si esprimono in unita principali, il movimento in centesimi.
    const amount = Math.abs(transaction.amountCents) / 100;
    if (rule.operator === "greater_than") return amount > threshold;
    if (rule.operator === "less_than") return amount < threshold;
    if (rule.operator === "equals") return Math.abs(amount - threshold) < 0.005;
    return false;
  }

  const haystack = normalize(
    rule.field === "counterparty" ? (transaction.counterparty ?? "") : transaction.description,
  );
  const needle = normalize(rule.value);
  if (needle === "") return false;

  switch (rule.operator) {
    case "contains":
      return haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "starts_with":
      return haystack.startsWith(needle);
    default:
      return false;
  }
}

export type RuleOutcome = {
  categoryId: string | null;
  envelopeId: string | null;
  ruleId: string | null;
};

/**
 * Prima regola che corrisponde, in ordine di priorita. Non si fondono piu
 * regole: una spesa ha una categoria sola, e la prima regola vince.
 */
export function applyRules(rules: Rule[], transaction: MatchableTransaction): RuleOutcome {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const rule of ordered) {
    if (ruleMatches(rule, transaction)) {
      return { categoryId: rule.categoryId, envelopeId: rule.envelopeId, ruleId: rule.id };
    }
  }
  return { categoryId: null, envelopeId: null, ruleId: null };
}

/**
 * Regola proposta dopo una correzione manuale: si prende la parte stabile
 * della descrizione, cioe le prime parole non numeriche, che di solito sono
 * il nome dell'esercente.
 */
export function suggestRule(
  transaction: MatchableTransaction,
  categoryId: string,
  envelopeId: string | null,
): Omit<Rule, "id" | "priority" | "enabled"> | null {
  const source = transaction.counterparty?.trim() || transaction.description;
  const token = merchantToken(source);
  if (!token) return null;
  return {
    field: transaction.counterparty?.trim() ? "counterparty" : "description",
    operator: "contains",
    value: token,
    categoryId,
    envelopeId,
  };
}

/**
 * Estrae il nome dell'esercente da una descrizione bancaria, togliendo le
 * parti che cambiano a ogni movimento: date, numeri di carta, codici, importi.
 */
export function merchantToken(description: string): string | null {
  const cleaned = description
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, " ")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b/gi, " ")
    .replace(/\b\d[\d.,]*\b/g, " ")
    .replace(/\*+/g, " ")
    .replace(/\b(pos|pagamento|carta|acquisto|addebito|bonifico|sepa|c\/o|ref|cod)\b/gi, " ")
    .replace(/[^\p{L}\s&'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3) return null;
  // Due parole bastano a identificare un esercente senza legarsi al resto.
  const words = cleaned.split(" ").filter((word) => word.length > 1);
  if (words.length === 0) return null;
  return words.slice(0, 2).join(" ").toUpperCase();
}

// ---------------------------------------------------------------------------
// Giroconti
// ---------------------------------------------------------------------------

export type TransferCandidate = {
  id: string;
  accountId: string;
  bookedDate: string;
  amountCents: number;
  description: string;
};

export type TransferPair = { outId: string; inId: string };

/**
 * Abbina le due gambe di un giroconto: stesso importo, segno opposto, conti
 * propri diversi, entro alcuni giorni. Vanno escluse da spese ed entrate,
 * altrimenti spostare soldi tra i propri conti sembrerebbe un acquisto.
 */
export function matchTransfers(
  candidates: TransferCandidate[],
  options: { windowDays?: number } = {},
): TransferPair[] {
  const windowDays = options.windowDays ?? 3;
  const outgoing = candidates.filter((row) => row.amountCents < 0);
  const incoming = candidates.filter((row) => row.amountCents > 0);
  const usedIncoming = new Set<string>();
  const pairs: TransferPair[] = [];

  for (const out of outgoing) {
    const match = incoming
      .filter((candidate) => !usedIncoming.has(candidate.id))
      .filter((candidate) => candidate.accountId !== out.accountId)
      .filter((candidate) => candidate.amountCents === -out.amountCents)
      .filter((candidate) => Math.abs(daysBetween(out.bookedDate, candidate.bookedDate)) <= windowDays)
      // A parita di importo vince la data piu vicina: due giroconti uguali
      // nello stesso mese non devono incrociarsi.
      .sort(
        (a, b) =>
          Math.abs(daysBetween(out.bookedDate, a.bookedDate)) -
          Math.abs(daysBetween(out.bookedDate, b.bookedDate)),
      )[0];

    if (match) {
      usedIncoming.add(match.id);
      pairs.push({ outId: out.id, inId: match.id });
    }
  }

  return pairs;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Riconosce un'entrata da stipendio: controparte attesa e importo sopra una
 * soglia. Serve ad aprire il giorno di paga con l'importo gia scritto.
 */
export function looksLikeIncome(
  transaction: MatchableTransaction,
  config: { counterparty?: string | null; minAmountCents: number },
): boolean {
  if (transaction.amountCents < config.minAmountCents) return false;
  if (!config.counterparty) return true;
  const haystack = normalize(`${transaction.description} ${transaction.counterparty ?? ""}`);
  return haystack.includes(normalize(config.counterparty));
}
