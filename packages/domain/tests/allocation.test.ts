import { describe, expect, it } from "vitest";
import {
  canClosePayday,
  computeAllocation,
  defaultLine,
  validateTemplate,
  type AllocationLineInput,
} from "@pocketly/domain/allocation";

const fixed = (label: string, cents: number, priority = 0): AllocationLineInput =>
  defaultLine({ id: label, label, kind: "fixed", envelopeId: "env", amountCents: cents, priority });

const percent = (
  label: string,
  bps: number,
  priority = 0,
  basis: "gross" | "remaining" = "gross",
): AllocationLineInput =>
  defaultLine({
    id: label,
    label,
    kind: "percent",
    envelopeId: "env",
    percentBps: bps,
    percentBasis: basis,
    priority,
  });

const remainder = (label = "resto", priority = 99): AllocationLineInput =>
  defaultLine({ id: label, label, kind: "remainder", envelopeId: "env", priority });

describe("computeAllocation", () => {
  it("assegna importi fissi e lascia il resto da assegnare", () => {
    const plan = computeAllocation(200000, [fixed("affitto", 70000), fixed("spesa", 40000)]);
    expect(plan.assignedCents).toBe(110000);
    expect(plan.unassignedCents).toBe(90000);
    expect(plan.overAllocated).toBe(false);
  });

  it("la riga resto porta il da assegnare a zero", () => {
    const plan = computeAllocation(200000, [
      fixed("affitto", 70000),
      fixed("spesa", 40000),
      remainder(),
    ]);
    expect(plan.unassignedCents).toBe(0);
    expect(plan.lines.find((l) => l.id === "resto")?.plannedCents).toBe(90000);
  });

  it("applica le percentuali sul lordo", () => {
    const plan = computeAllocation(250000, [percent("tasse", 2500), remainder()]);
    expect(plan.lines.find((l) => l.id === "tasse")?.plannedCents).toBe(62500);
    expect(plan.unassignedCents).toBe(0);
  });

  it("applica le percentuali su quanto resta, in ordine di priorita", () => {
    // 10% di 1000,00 = 100,00; poi 50% dei restanti 900,00 = 450,00.
    const plan = computeAllocation(100000, [
      percent("tasse", 1000, 1),
      percent("risparmio", 5000, 2, "remaining"),
    ]);
    expect(plan.lines.find((l) => l.id === "tasse")?.plannedCents).toBe(10000);
    expect(plan.lines.find((l) => l.id === "risparmio")?.plannedCents).toBe(45000);
  });

  it("non perde centesimi con percentuali che non tornano", () => {
    // Tre righe al 33,33% su 100,01: il resto assorbe lo scarto.
    const plan = computeAllocation(10001, [
      percent("a", 3333, 1),
      percent("b", 3333, 2),
      percent("c", 3333, 3),
      remainder(),
    ]);
    const total = plan.lines.reduce((acc, l) => acc + l.plannedCents, 0);
    expect(total).toBe(10001);
    expect(plan.unassignedCents).toBe(0);
  });

  it("segnala la sovra-assegnazione", () => {
    const plan = computeAllocation(100000, [fixed("affitto", 70000), fixed("auto", 50000)]);
    expect(plan.assignedCents).toBe(120000);
    expect(plan.unassignedCents).toBe(-20000);
    expect(plan.overAllocated).toBe(true);
  });

  it("con il resto, la sovra-assegnazione rende negativa la riga resto", () => {
    const plan = computeAllocation(100000, [fixed("auto", 150000), remainder()]);
    expect(plan.lines.find((l) => l.id === "resto")?.plannedCents).toBe(-50000);
    expect(plan.unassignedCents).toBe(0);
  });

  it("gestisce un'entrata a zero", () => {
    const plan = computeAllocation(0, [percent("tasse", 2500), remainder()]);
    expect(plan.assignedCents).toBe(0);
    expect(plan.unassignedCents).toBe(0);
  });

  it("gestisce un modello vuoto", () => {
    const plan = computeAllocation(100000, []);
    expect(plan.lines).toEqual([]);
    expect(plan.unassignedCents).toBe(100000);
  });

  it("mantiene l'ordine originale delle righe in uscita", () => {
    const plan = computeAllocation(100000, [
      remainder("resto", 99),
      fixed("affitto", 70000, 1),
    ]);
    expect(plan.lines.map((l) => l.id)).toEqual(["resto", "affitto"]);
    expect(plan.lines[0]?.plannedCents).toBe(30000);
  });

  it("ripartisce il resto tra piu righe resto senza perdere centesimi", () => {
    const plan = computeAllocation(10001, [remainder("r1", 10), remainder("r2", 11)]);
    const total = plan.lines.reduce((acc, l) => acc + l.plannedCents, 0);
    expect(total).toBe(10001);
    expect(plan.unassignedCents).toBe(0);
  });
});

describe("validateTemplate", () => {
  it("accetta un modello corretto", () => {
    const issues = validateTemplate([fixed("affitto", 70000), remainder()]);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("rifiuta due righe resto", () => {
    const issues = validateTemplate([remainder("r1"), remainder("r2")]);
    expect(issues.some((i) => i.code === "multiple_remainder" && i.level === "error")).toBe(true);
  });

  it("rifiuta una riga senza busta di destinazione", () => {
    const line = defaultLine({ id: "x", label: "x", kind: "fixed", amountCents: 100 });
    expect(validateTemplate([line]).some((i) => i.code === "missing_envelope")).toBe(true);
  });

  it("rifiuta importi negativi e percentuali fuori scala", () => {
    expect(validateTemplate([fixed("a", -100)]).some((i) => i.code === "negative_value")).toBe(true);
    expect(validateTemplate([percent("a", 20000)]).some((i) => i.code === "negative_value")).toBe(
      true,
    );
  });

  it("avvisa se le percentuali sul lordo superano il 100%", () => {
    const issues = validateTemplate([percent("a", 6000), percent("b", 5000)]);
    expect(issues.some((i) => i.code === "percent_over_100" && i.level === "warning")).toBe(true);
  });

  it("rifiuta un modello senza righe", () => {
    expect(validateTemplate([]).some((i) => i.code === "no_lines")).toBe(true);
  });
});

describe("canClosePayday", () => {
  it("non si chiude con da assegnare diverso da zero", () => {
    const plan = computeAllocation(200000, [fixed("affitto", 70000)]);
    expect(canClosePayday(plan, { affitto: true })).toBe(false);
  });

  it("non si chiude con righe non spuntate", () => {
    const plan = computeAllocation(70000, [fixed("affitto", 70000)]);
    expect(canClosePayday(plan, {})).toBe(false);
    expect(canClosePayday(plan, { affitto: true })).toBe(true);
  });

  it("ignora le righe a zero nella checklist", () => {
    const plan = computeAllocation(70000, [fixed("affitto", 70000), fixed("vuota", 0)]);
    expect(canClosePayday(plan, { affitto: true })).toBe(true);
  });

  it("non si chiude in sovra-assegnazione", () => {
    const plan = computeAllocation(50000, [fixed("affitto", 70000)]);
    expect(canClosePayday(plan, { affitto: true })).toBe(false);
  });
});
