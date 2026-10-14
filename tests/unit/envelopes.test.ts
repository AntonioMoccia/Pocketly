import { describe, expect, it } from "vitest";
import {
  carryOverFor,
  checkAccountConsistency,
  computeEnvelopeState,
  coverageOptions,
  planSweeps,
  transferForMisplacedExpense,
  type EnvelopeInput,
  type EnvelopeMonthInput,
} from "@/lib/envelopes";

const envelope = (partial: Partial<EnvelopeInput> & { id: string }): EnvelopeInput => ({
  name: partial.id,
  kind: "virtual",
  accountId: "revolut",
  leftoverPolicy: "accumulate",
  sweepToEnvelopeId: null,
  color: 0,
  archived: false,
  ...partial,
});

const month = (partial: Partial<EnvelopeMonthInput> = {}): EnvelopeMonthInput => ({
  carryOverCents: 0,
  assignedCents: 0,
  movedInCents: 0,
  movedOutCents: 0,
  spentCents: 0,
  ...partial,
});

describe("computeEnvelopeState", () => {
  it("calcola il disponibile di una busta virtuale", () => {
    // riporto + assegnato + ricevuti - ceduti - speso
    const state = computeEnvelopeState(
      envelope({ id: "spesa" }),
      month({ carryOverCents: 2000, assignedCents: 30000, movedInCents: 1000, movedOutCents: 500, spentCents: 18640 }),
    );
    expect(state.budgetedCents).toBe(32500);
    expect(state.availableCents).toBe(13860);
    expect(state.overspent).toBe(false);
  });

  it("per una busta reale vince il saldo del Pocket", () => {
    // Il Pocket dice 150: quello c'e, qualunque cosa dicano le assegnazioni.
    const state = computeEnvelopeState(
      envelope({ id: "sfizi", kind: "real" }),
      month({ assignedCents: 15000, spentCents: 16200, realBalanceCents: 15000 }),
    );
    expect(state.availableCents).toBe(15000);
  });

  it("riconosce lo sforamento e di quanto", () => {
    const state = computeEnvelopeState(
      envelope({ id: "sfizi" }),
      month({ assignedCents: 15000, spentCents: 16200 }),
    );
    expect(state.availableCents).toBe(-1200);
    expect(state.overspent).toBe(true);
    expect(state.overspentByCents).toBe(1200);
    expect(state.usedRatio).toBe(1);
  });

  it("non divide per zero senza budget", () => {
    const state = computeEnvelopeState(envelope({ id: "vuota" }), month({ spentCents: 500 }));
    expect(Number.isFinite(state.usedRatio)).toBe(true);
    expect(state.usedRatio).toBe(1);
    expect(state.availableCents).toBe(-500);
  });

  it("il riporto di una busta che accumula e il suo disponibile", () => {
    const state = computeEnvelopeState(
      envelope({ id: "auto", leftoverPolicy: "accumulate" }),
      month({ assignedCents: 6000, spentCents: 5000 }),
    );
    expect(carryOverFor(state)).toBe(1000);
  });

  it("una busta che si svuota non riporta nulla", () => {
    const state = computeEnvelopeState(
      envelope({ id: "sfizi", leftoverPolicy: "sweep", sweepToEnvelopeId: "fondo" }),
      month({ assignedCents: 15000, spentCents: 10000 }),
    );
    expect(carryOverFor(state)).toBe(0);
  });
});

describe("planSweeps", () => {
  const build = (input: Partial<EnvelopeInput> & { id: string }, m: Partial<EnvelopeMonthInput>) =>
    computeEnvelopeState(envelope(input), month(m));

  it("sposta gli avanzi delle buste con politica svuota", () => {
    const states = [
      build({ id: "sfizi", leftoverPolicy: "sweep", sweepToEnvelopeId: "fondo" }, { assignedCents: 15000, spentCents: 10000 }),
      build({ id: "auto", leftoverPolicy: "accumulate" }, { assignedCents: 6000, spentCents: 1000 }),
    ];
    expect(planSweeps(states)).toEqual([
      { fromEnvelopeId: "sfizi", toEnvelopeId: "fondo", amountCents: 5000 },
    ]);
  });

  it("una busta in rosso non svuota nulla", () => {
    const states = [
      build({ id: "sfizi", leftoverPolicy: "sweep", sweepToEnvelopeId: "fondo" }, { assignedCents: 15000, spentCents: 16200 }),
    ];
    expect(planSweeps(states)).toEqual([]);
  });

  it("ignora una busta che si svuoterebbe in se stessa", () => {
    const states = [
      build({ id: "sfizi", leftoverPolicy: "sweep", sweepToEnvelopeId: "sfizi" }, { assignedCents: 15000 }),
    ];
    expect(planSweeps(states)).toEqual([]);
  });

  it("ignora una busta senza destinazione", () => {
    const states = [build({ id: "sfizi", leftoverPolicy: "sweep" }, { assignedCents: 15000 })];
    expect(planSweeps(states)).toEqual([]);
  });
});

describe("coverageOptions", () => {
  const target = computeEnvelopeState(
    envelope({ id: "sfizi", accountId: "revolut-pocket-sfizi", kind: "real" }),
    month({ assignedCents: 15000, spentCents: 16200 }),
  );

  const candidates = [
    computeEnvelopeState(
      envelope({ id: "spesa", accountId: "revolut-pocket-sfizi" }),
      month({ assignedCents: 30000, spentCents: 18640 }),
    ),
    computeEnvelopeState(
      envelope({ id: "abbigliamento", accountId: "revolut-pocket-abbigliamento", kind: "real" }),
      month({ assignedCents: 9000, realBalanceCents: 9000 }),
    ),
    computeEnvelopeState(
      envelope({ id: "fondo", accountId: "trade-republic" }),
      month({ assignedCents: 320000 }),
    ),
    computeEnvelopeState(envelope({ id: "vuota" }), month({ assignedCents: 0 })),
  ];

  it("mette prima le buste sullo stesso conto, che non richiedono bonifici", () => {
    const options = coverageOptions(target, candidates);
    expect(options[0]?.envelopeId).toBe("spesa");
    expect(options[0]?.needsTransfer).toBe(false);
  });

  it("segnala quali coperture richiedono un giroconto", () => {
    const options = coverageOptions(target, candidates);
    const abbigliamento = options.find((option) => option.envelopeId === "abbigliamento");
    expect(abbigliamento?.needsTransfer).toBe(true);
    expect(abbigliamento?.fromAccountId).toBe("revolut-pocket-abbigliamento");
    expect(abbigliamento?.toAccountId).toBe("revolut-pocket-sfizi");
  });

  it("esclude le buste senza disponibile e se stessa", () => {
    const options = coverageOptions(target, [...candidates, target]);
    expect(options.map((option) => option.envelopeId)).not.toContain("vuota");
    expect(options.map((option) => option.envelopeId)).not.toContain("sfizi");
  });

  it("manda in fondo le buste sconsigliate, senza vietarle", () => {
    const options = coverageOptions(target, candidates, { discouragedIds: ["fondo"] });
    expect(options.at(-1)?.envelopeId).toBe("fondo");
    expect(options.some((option) => option.envelopeId === "fondo")).toBe(true);
  });
});

describe("checkAccountConsistency", () => {
  it("buste piu non assegnato devono dare il saldo", () => {
    const envelopes = [
      computeEnvelopeState(envelope({ id: "spesa", accountId: "revolut" }), month({ assignedCents: 10000 })),
      computeEnvelopeState(envelope({ id: "fisse", accountId: "revolut" }), month({ assignedCents: 5000 })),
    ];
    const result = checkAccountConsistency("revolut", 42000, envelopes);
    expect(result.envelopesCents).toBe(15000);
    expect(result.unassignedCents).toBe(27000);
    expect(result.inconsistent).toBe(false);
  });

  it("segnala la differenza quando il non assegnato dichiarato non torna", () => {
    const envelopes = [
      computeEnvelopeState(envelope({ id: "spesa", accountId: "revolut" }), month({ assignedCents: 10000 })),
    ];
    const result = checkAccountConsistency("revolut", 42000, envelopes, 30000);
    expect(result.inconsistent).toBe(true);
    expect(result.differenceCents).toBe(2000);
  });

  it("ignora le buste di altri conti e quelle reali", () => {
    const envelopes = [
      computeEnvelopeState(envelope({ id: "spesa", accountId: "revolut" }), month({ assignedCents: 10000 })),
      computeEnvelopeState(envelope({ id: "altro", accountId: "bper" }), month({ assignedCents: 99900 })),
      computeEnvelopeState(
        envelope({ id: "pocket", accountId: "revolut", kind: "real" }),
        month({ realBalanceCents: 50000 }),
      ),
    ];
    expect(checkAccountConsistency("revolut", 42000, envelopes).envelopesCents).toBe(10000);
  });
});

describe("transferForMisplacedExpense", () => {
  it("propone il giroconto quando la busta sta su un altro conto", () => {
    // Pizzeria da 28 euro pagata dal saldo principale, busta Sfizi (Pocket):
    // il Pocket deve rimborsare il saldo principale.
    const result = transferForMisplacedExpense(
      "revolut-principale",
      envelope({ id: "sfizi", accountId: "revolut-pocket-sfizi", kind: "real" }),
      2800,
    );
    expect(result).toEqual({
      fromAccountId: "revolut-pocket-sfizi",
      toAccountId: "revolut-principale",
      amountCents: 2800,
    });
  });

  it("non propone nulla se la busta sta sul conto che ha pagato", () => {
    expect(
      transferForMisplacedExpense("revolut", envelope({ id: "spesa", accountId: "revolut" }), 2800),
    ).toBeNull();
  });

  it("ignora importi non positivi", () => {
    expect(
      transferForMisplacedExpense("a", envelope({ id: "x", accountId: "b" }), 0),
    ).toBeNull();
  });
});
