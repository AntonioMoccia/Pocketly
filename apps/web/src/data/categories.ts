/**
 * Categorie lette dall'API.
 */
import { api } from "@/lib/api";
import type { CategoryRow } from "@api/data/categories";

export type { CategoryRow };

export function listCategories() {
  return api.get<CategoryRow[]>("/categories");
}
