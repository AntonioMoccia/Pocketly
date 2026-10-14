/**
 * Categorie (F1.5.2): albero predefinito in italiano e inglese, modificabile,
 * con busta predefinita per categoria.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { DomainError } from "./accounts";

export type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  kind: "expense" | "income" | "transfer";
  defaultEnvelopeId: string | null;
  color: number;
};

export async function listCategories(householdId: string): Promise<CategoryRow[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      kind: categories.kind,
      defaultEnvelopeId: categories.defaultEnvelopeId,
      color: categories.color,
    })
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function saveCategory(
  householdId: string,
  input: {
    name: string;
    parentId: string | null;
    kind: "expense" | "income" | "transfer";
    defaultEnvelopeId: string | null;
  },
  categoryId?: string,
): Promise<string> {
  if (categoryId && input.parentId === categoryId) throw new DomainError("validation");

  if (categoryId) {
    const updated = await db
      .update(categories)
      .set({
        name: input.name.trim(),
        parentId: input.parentId,
        kind: input.kind,
        defaultEnvelopeId: input.defaultEnvelopeId,
      })
      .where(and(eq(categories.id, categoryId), eq(categories.householdId, householdId)))
      .returning({ id: categories.id });
    if (updated.length === 0) throw new DomainError("notFound");
    return categoryId;
  }

  const [created] = await db
    .insert(categories)
    .values({
      householdId,
      name: input.name.trim(),
      parentId: input.parentId,
      kind: input.kind,
      defaultEnvelopeId: input.defaultEnvelopeId,
    })
    .returning({ id: categories.id });
  if (!created) throw new DomainError("validation");
  return created.id;
}

export async function deleteCategory(householdId: string, categoryId: string): Promise<void> {
  await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.householdId, householdId)));
}

/**
 * Albero predefinito. Nomi in italiano o inglese secondo la lingua scelta
 * all'onboarding; restano modificabili uno per uno.
 */
const DEFAULT_TREE: { it: string; en: string; kind: "expense" | "income" | "transfer" }[] = [
  { it: "Spesa alimentare", en: "Groceries", kind: "expense" },
  { it: "Ristoranti", en: "Restaurants", kind: "expense" },
  { it: "Bar", en: "Cafes", kind: "expense" },
  { it: "Carburante", en: "Fuel", kind: "expense" },
  { it: "Manutenzione auto", en: "Car upkeep", kind: "expense" },
  { it: "Trasporti", en: "Transport", kind: "expense" },
  { it: "Casa", en: "Home", kind: "expense" },
  { it: "Bollette", en: "Utilities", kind: "expense" },
  { it: "Abbonamenti", en: "Subscriptions", kind: "expense" },
  { it: "Rata auto", en: "Car loan", kind: "expense" },
  { it: "Abbigliamento", en: "Clothing", kind: "expense" },
  { it: "Salute", en: "Health", kind: "expense" },
  { it: "Svago", en: "Leisure", kind: "expense" },
  { it: "Viaggi", en: "Travel", kind: "expense" },
  { it: "Istruzione", en: "Education", kind: "expense" },
  { it: "Regali", en: "Gifts", kind: "expense" },
  { it: "Elettronica", en: "Electronics", kind: "expense" },
  { it: "Tasse e imposte", en: "Taxes", kind: "expense" },
  { it: "Commissioni", en: "Fees", kind: "expense" },
  { it: "Altro", en: "Other", kind: "expense" },
  { it: "Stipendio", en: "Salary", kind: "income" },
  { it: "Fatture", en: "Invoices", kind: "income" },
  { it: "Rimborsi", en: "Refunds", kind: "income" },
  { it: "Interessi", en: "Interest", kind: "income" },
  { it: "Giroconto", en: "Transfer", kind: "transfer" },
];

/** Crea l'albero predefinito se l'household non ha ancora categorie. */
export async function seedCategories(householdId: string, locale: "it" | "en"): Promise<number> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .limit(1);
  if (existing) return 0;

  await db.insert(categories).values(
    DEFAULT_TREE.map((entry, index) => ({
      householdId,
      name: locale === "en" ? entry.en : entry.it,
      kind: entry.kind,
      sortOrder: index,
      color: index % 7,
    })),
  );
  return DEFAULT_TREE.length;
}

/** Collega ogni categoria alla busta predefinita indicata per nome. */
export async function linkDefaultEnvelopes(
  householdId: string,
  mapping: Record<string, string>,
): Promise<number> {
  const rows = await listCategories(householdId);
  let linked = 0;
  for (const row of rows) {
    const envelopeId = mapping[row.name];
    if (!envelopeId || row.defaultEnvelopeId === envelopeId) continue;
    await db
      .update(categories)
      .set({ defaultEnvelopeId: envelopeId })
      .where(eq(categories.id, row.id));
    linked += 1;
  }
  return linked;
}
