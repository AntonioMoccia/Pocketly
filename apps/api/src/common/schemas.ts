/**
 * Schemi di validazione condivisi dai controller. Gli importi arrivano gia in
 * unita minori (interi): la lettura di "1.234,56" scritto dall'utente spetta al
 * frontend, che conosce la lingua.
 */
import { z } from "zod";
import { isIsoDate } from "@pocketly/domain/date";

export const id = z.string().trim().min(1);
export const nullableId = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null));
export const cents = z.number().int().refine(Number.isSafeInteger);
export const isoDate = z.string().refine(isIsoDate, "Data non valida");
export const currency = z.string().trim().length(3);
