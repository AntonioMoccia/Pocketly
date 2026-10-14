import { describe, expect, it } from "vitest";
import {
  applyBps,
  currencyDigits,
  distribute,
  formatMoney,
  isValidCurrency,
  parseAmountToCents,
  roundHalfAway,
  toMajor,
  toMinor,
} from "@/lib/money";

describe("currencyDigits", () => {
  it("conosce le cifre decimali delle valute ISO 4217", () => {
    expect(currencyDigits("EUR")).toBe(2);
    expect(currencyDigits("usd")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
  });

  it("ripiega su 2 cifre per codici sconosciuti", () => {
    expect(currencyDigits("XXZ")).toBe(2);
  });
});

describe("isValidCurrency", () => {
  it("accetta codici validi e rifiuta il resto", () => {
    expect(isValidCurrency("EUR")).toBe(true);
    expect(isValidCurrency("CHF")).toBe(true);
    expect(isValidCurrency("EURO")).toBe(false);
    expect(isValidCurrency("12A")).toBe(false);
    expect(isValidCurrency("")).toBe(false);
  });
});

describe("roundHalfAway", () => {
  it("arrotonda simmetricamente rispetto allo zero", () => {
    expect(roundHalfAway(0.5)).toBe(1);
    expect(roundHalfAway(-0.5)).toBe(-1);
    expect(roundHalfAway(2.4)).toBe(2);
    expect(roundHalfAway(-2.6)).toBe(-3);
  });
});

describe("unita minori", () => {
  it("converte avanti e indietro", () => {
    expect(toMinor(1234.56)).toBe(123456);
    expect(toMinor(1234.565)).toBe(123457);
    expect(toMajor(123456)).toBe(1234.56);
    expect(toMinor(1000, "JPY")).toBe(1000);
    expect(toMajor(1000, "JPY")).toBe(1000);
  });
});

describe("applyBps", () => {
  it("applica percentuali in punti base", () => {
    expect(applyBps(100000, 1000)).toBe(10000); // 10% di 1000,00
    expect(applyBps(100000, 2250)).toBe(22500); // 22,5%
    expect(applyBps(333, 3333)).toBe(111); // arrotondamento
    expect(applyBps(-100000, 1000)).toBe(-10000);
  });
});

describe("distribute", () => {
  it("non perde ne crea centesimi", () => {
    const parts = distribute(10000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(parts).toEqual([3334, 3333, 3333]);
  });

  it("gestisce pesi diversi", () => {
    const parts = distribute(1000, [50, 30, 20]);
    expect(parts).toEqual([500, 300, 200]);
  });

  it("gestisce importi negativi", () => {
    const parts = distribute(-1000, [1, 1, 3]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it("con pesi nulli mette tutto sulla prima quota", () => {
    expect(distribute(500, [0, 0])).toEqual([500, 0]);
  });

  it("su lista vuota restituisce lista vuota", () => {
    expect(distribute(500, [])).toEqual([]);
  });

  it("un centesimo su tre quote resta un centesimo", () => {
    const parts = distribute(1, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("parseAmountToCents", () => {
  it("legge la notazione italiana", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("2.350")).toBe(235000);
    expect(parseAmountToCents("12,5")).toBe(1250);
    expect(parseAmountToCents("0,07")).toBe(7);
  });

  it("legge la notazione inglese", () => {
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("2,350")).toBe(235000);
    expect(parseAmountToCents("12.5")).toBe(1250);
  });

  it("ignora simboli di valuta e spazi", () => {
    expect(parseAmountToCents(" 1 234,56 EUR ")).toBe(123456);
    expect(parseAmountToCents("€ 1.500,00")).toBe(150000);
    expect(parseAmountToCents("1 234,56")).toBe(123456);
  });

  it("gestisce il segno", () => {
    expect(parseAmountToCents("-45,20")).toBe(-4520);
    expect(parseAmountToCents("+45,20")).toBe(4520);
    expect(parseAmountToCents("-0,00")).toBe(0);
  });

  it("arrotonda le cifre oltre la precisione della valuta", () => {
    // Coda di 4 cifre: non c'e ambiguita, sono decimali.
    expect(parseAmountToCents("1,0050")).toBe(101);
    expect(parseAmountToCents("1,0049")).toBe(100);
    expect(parseAmountToCents("0,125")).toBe(13);
  });

  it("rispetta le valute senza decimali", () => {
    expect(parseAmountToCents("1500", "JPY")).toBe(1500);
    expect(parseAmountToCents("1.500", "JPY")).toBe(1500);
  });

  it("rifiuta input non numerici", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("   ")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("1-2")).toBeNull();
  });

  it("tratta una coda di tre cifre come migliaia, salvo parte intera a zero", () => {
    // Ambiguo per natura: in finanza una terzina e un separatore di migliaia.
    expect(parseAmountToCents("1,005")).toBe(100500);
    expect(parseAmountToCents("0,123")).toBe(12);
  });
});

describe("formatMoney", () => {
  it("formatta secondo il locale", () => {
    // L'italiano non raggruppa i numeri a 4 cifre (minimumGroupingDigits: 2).
    expect(formatMoney(123456, "EUR", "it")).toContain("1234,56");
    expect(formatMoney(12345678, "EUR", "it")).toContain("123.456,78");
    expect(formatMoney(123456, "EUR", "en")).toContain("1,234.56");
  });

  it("mostra il segno quando richiesto", () => {
    expect(formatMoney(5000, "EUR", "it", { showSign: true })).toContain("+");
    expect(formatMoney(-5000, "EUR", "it")).toContain("-");
  });

  it("rispetta le valute senza decimali", () => {
    expect(formatMoney(1500, "JPY", "it")).not.toContain(",00");
  });
});
