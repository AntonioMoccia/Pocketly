import { describe, expect, it } from "vitest";
import { computeGoalProgress, monthsBetween, summarizeInvestment } from "@pocketly/domain/goals";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("monthsBetween", () => {
  it("conta i mesi interi", () => {
    expect(monthsBetween(d("2026-10-14"), d("2027-10-14"))).toBe(12);
    expect(monthsBetween(d("2026-10-14"), d("2026-12-14"))).toBe(2);
  });

  it("non conta il mese se il giorno non e ancora arrivato", () => {
    expect(monthsBetween(d("2026-10-20"), d("2026-12-14"))).toBe(1);
  });

  it("va in negativo su date passate", () => {
    expect(monthsBetween(d("2026-10-14"), d("2026-08-14"))).toBe(-2);
  });
});

describe("computeGoalProgress", () => {
  it("calcola avanzamento, mancante e rata mensile", () => {
    const p = computeGoalProgress(1_000_000, 250_000, d("2027-10-14"), d("2026-10-14"));
    expect(p.ratio).toBeCloseTo(0.25, 6);
    expect(p.remainingCents).toBe(750_000);
    expect(p.monthsLeft).toBe(12);
    expect(p.perMonthCents).toBe(62_500);
    expect(p.reached).toBe(false);
    expect(p.overdue).toBe(false);
  });

  it("arrotonda la rata per eccesso, per arrivare in tempo", () => {
    const p = computeGoalProgress(100_000, 0, d("2027-01-14"), d("2026-10-14"));
    expect(p.monthsLeft).toBe(3);
    expect(p.perMonthCents).toBe(33_334);
  });

  it("riconosce un obiettivo raggiunto", () => {
    const p = computeGoalProgress(100_000, 120_000, d("2027-01-14"), d("2026-10-14"));
    expect(p.reached).toBe(true);
    expect(p.ratio).toBe(1);
    expect(p.remainingCents).toBe(0);
    expect(p.perMonthCents).toBe(0);
  });

  it("segnala una scadenza passata non raggiunta", () => {
    const p = computeGoalProgress(100_000, 10_000, d("2026-09-01"), d("2026-10-14"));
    expect(p.overdue).toBe(true);
    expect(p.monthsLeft).toBe(0);
    expect(p.perMonthCents).toBe(90_000);
  });

  it("non segnala in ritardo un obiettivo raggiunto a scadenza passata", () => {
    const p = computeGoalProgress(100_000, 100_000, d("2026-09-01"), d("2026-10-14"));
    expect(p.overdue).toBe(false);
  });

  it("senza scadenza non calcola rate", () => {
    const p = computeGoalProgress(100_000, 25_000, null, d("2026-10-14"));
    expect(p.monthsLeft).toBeNull();
    expect(p.perMonthCents).toBeNull();
  });

  it("gestisce un target a zero senza dividere per zero", () => {
    const p = computeGoalProgress(0, 0, null, d("2026-10-14"));
    expect(Number.isFinite(p.ratio)).toBe(true);
    expect(p.ratio).toBe(0);
  });
});

describe("summarizeInvestment", () => {
  it("confronta capitale versato e valore attuale", () => {
    const s = summarizeInvestment(
      [
        { date: "2026-01-01", amountCents: 20000, kind: "deposit" },
        { date: "2026-02-01", amountCents: 20000, kind: "deposit" },
        { date: "2026-03-01", amountCents: 20000, kind: "deposit" },
      ],
      70000,
    );
    expect(s.investedCents).toBe(60000);
    expect(s.valueCents).toBe(70000);
    expect(s.gainCents).toBe(10000);
    expect(s.returnRatio).toBeCloseTo(0.1667, 4);
  });

  it("sottrae i rimborsi dal capitale versato", () => {
    const s = summarizeInvestment(
      [
        { date: "2026-01-01", amountCents: 50000, kind: "deposit" },
        { date: "2026-06-01", amountCents: 10000, kind: "withdrawal" },
      ],
      45000,
    );
    expect(s.investedCents).toBe(40000);
    expect(s.gainCents).toBe(5000);
  });

  it("senza valore inserito assume il capitale versato", () => {
    const s = summarizeInvestment([{ date: "2026-01-01", amountCents: 10000, kind: "deposit" }], null);
    expect(s.valueCents).toBe(10000);
    expect(s.gainCents).toBe(0);
    expect(s.returnRatio).toBe(0);
  });

  it("non calcola rendimento senza capitale versato", () => {
    expect(summarizeInvestment([], 0).returnRatio).toBeNull();
  });
});
