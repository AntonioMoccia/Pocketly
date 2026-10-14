import { describe, expect, it } from "vitest";
import {
  MissingRateError,
  convertMinor,
  convertWithRates,
  crossRate,
  rateAsOf,
} from "@pocketly/domain/fx";

// Tassi in stile BCE: 1 EUR = N unita della valuta.
const rates = { USD: 1.0850, CHF: 0.9300, GBP: 0.8500, JPY: 161.50 };

describe("crossRate", () => {
  it("vale 1 sulla stessa valuta", () => {
    expect(crossRate("EUR", "EUR", rates)).toBe(1);
    expect(crossRate("usd", "USD", rates)).toBe(1);
  });

  it("usa i tassi BCE con base EUR", () => {
    expect(crossRate("EUR", "USD", rates)).toBeCloseTo(1.085, 6);
    expect(crossRate("USD", "EUR", rates)).toBeCloseTo(1 / 1.085, 6);
  });

  it("incrocia due valute passando da EUR", () => {
    expect(crossRate("CHF", "USD", rates)).toBeCloseTo(1.085 / 0.93, 6);
  });

  it("segnala un tasso mancante", () => {
    expect(() => crossRate("SEK", "EUR", rates)).toThrow(MissingRateError);
    expect(() => crossRate("EUR", "SEK", rates)).toThrow(/SEK/);
  });
});

describe("convertMinor", () => {
  it("converte centesimi tra valute a 2 decimali", () => {
    // 1000,00 CHF -> EUR con 1 EUR = 0,93 CHF
    const rate = crossRate("CHF", "EUR", rates);
    expect(convertMinor(100000, "CHF", "EUR", rate)).toBe(107527);
  });

  it("tiene conto delle cifre decimali diverse", () => {
    // 10.000 JPY (0 decimali) -> EUR (2 decimali)
    const rate = crossRate("JPY", "EUR", rates);
    expect(convertMinor(10000, "JPY", "EUR", rate)).toBe(6192);
    // e il ritorno
    const back = crossRate("EUR", "JPY", rates);
    expect(convertMinor(6192, "EUR", "JPY", back)).toBe(10000);
  });

  it("non tocca gli importi nella stessa valuta", () => {
    expect(convertMinor(12345, "EUR", "eur", 1)).toBe(12345);
  });

  it("gestisce importi negativi simmetricamente", () => {
    const rate = crossRate("USD", "EUR", rates);
    expect(convertMinor(-100000, "USD", "EUR", rate)).toBe(-convertMinor(100000, "USD", "EUR", rate));
  });
});

describe("convertWithRates", () => {
  it("restituisce anche il tasso applicato, da salvare con lo snapshot", () => {
    const result = convertWithRates(100000, "USD", "EUR", rates);
    expect(result.rate).toBeCloseTo(1 / 1.085, 6);
    expect(result.cents).toBe(92166);
  });
});

describe("rateAsOf", () => {
  const history = [
    { date: "2026-10-09", currency: "USD", rate: 1.08 },
    { date: "2026-10-12", currency: "USD", rate: 1.09 },
    { date: "2026-10-12", currency: "CHF", rate: 0.93 },
  ];

  it("prende il tasso del giorno esatto", () => {
    expect(rateAsOf(history, "USD", "2026-10-12")).toBe(1.09);
  });

  it("risale al giorno utile precedente nel weekend", () => {
    // 10 e 11 ottobre 2026 sono sabato e domenica.
    expect(rateAsOf(history, "USD", "2026-10-11")).toBe(1.08);
  });

  it("vale 1 per la valuta base EUR anche senza storico", () => {
    expect(rateAsOf([], "EUR", "2026-10-12")).toBe(1);
  });

  it("restituisce null se non c'e nessun tasso utile", () => {
    expect(rateAsOf(history, "USD", "2026-10-01")).toBeNull();
    expect(rateAsOf(history, "SEK", "2026-10-12")).toBeNull();
  });
});
