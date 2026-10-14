/**
 * Tipi di entrata. Non solo lo stipendio: una fattura da freelance, una
 * vendita su Vinted o un rimborso si ripartiscono allo stesso modo, ma
 * ognuno con il suo modello.
 */
export const INCOME_KINDS = ["salary", "invoice", "sale", "refund", "gift", "other"] as const;

export type IncomeKind = (typeof INCOME_KINDS)[number];

export function isIncomeKind(value: unknown): value is IncomeKind {
  return typeof value === "string" && (INCOME_KINDS as readonly string[]).includes(value);
}

/**
 * Tipo indovinato dal nome della categoria di un movimento in entrata, per
 * precompilare "Ripartisci". Le categorie sono modificabili, quindi e solo un
 * suggerimento: nel modulo il tipo resta cambiabile.
 */
const KIND_WORDS: [RegExp, IncomeKind][] = [
  [/stipend|salar|busta paga|payroll|wage/i, "salary"],
  [/fattur|invoice|freelanc|consulen/i, "invoice"],
  [/vendit|sale|vinted|subito|ebay|usato/i, "sale"],
  [/rimbors|refund|reso\b/i, "refund"],
  [/regal|gift/i, "gift"],
];

export function guessIncomeKind(categoryName: string | null | undefined): IncomeKind {
  if (!categoryName) return "other";
  for (const [pattern, kind] of KIND_WORDS) {
    if (pattern.test(categoryName)) return kind;
  }
  return "other";
}
