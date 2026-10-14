import { describe, expect, it } from "vitest";
import { guessIncomeKind, isIncomeKind } from "../src/income";

describe("guessIncomeKind", () => {
  it("riconosce le categorie predefinite in italiano e in inglese", () => {
    expect(guessIncomeKind("Stipendio")).toBe("salary");
    expect(guessIncomeKind("Salary")).toBe("salary");
    expect(guessIncomeKind("Fatture")).toBe("invoice");
    expect(guessIncomeKind("Vendite")).toBe("sale");
    expect(guessIncomeKind("Sales")).toBe("sale");
    expect(guessIncomeKind("Rimborsi")).toBe("refund");
    expect(guessIncomeKind("Regali")).toBe("gift");
  });

  it("riconosce le piattaforme di vendita dell'usato", () => {
    expect(guessIncomeKind("Vinted")).toBe("sale");
  });

  it("ripiega su altro senza categoria o con un nome sconosciuto", () => {
    expect(guessIncomeKind(null)).toBe("other");
    expect(guessIncomeKind("Interessi")).toBe("other");
  });
});

describe("isIncomeKind", () => {
  it("accetta solo i tipi noti", () => {
    expect(isIncomeKind("sale")).toBe(true);
    expect(isIncomeKind("bonus")).toBe(false);
    expect(isIncomeKind(undefined)).toBe(false);
  });
});
