import { describe, expect, it } from "vitest";
import {
  buildAccountTree,
  computeNetWorth,
  flattenTree,
  ownBalanceInBase,
  totalWithChildren,
  type AccountForTotals,
} from "@/lib/networth";

const rates = { USD: 1.0850, CHF: 0.9300 };

const account = (partial: Partial<AccountForTotals> & { id: string }): AccountForTotals => ({
  parentId: null,
  name: partial.id,
  category: "operational",
  currency: "EUR",
  liquid: true,
  archived: false,
  balanceCents: 0,
  rateToBase: null,
  ...partial,
});

describe("computeNetWorth", () => {
  it("somma i saldi nella valuta base", () => {
    const result = computeNetWorth(
      [
        account({ id: "bper", balanceCents: 250000 }),
        account({ id: "revolut", balanceCents: 120000 }),
      ],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(370000);
    expect(result.liquidCents).toBe(370000);
  });

  it("non conta due volte un Pocket", () => {
    // Conto padre 1000,00 con due Pocket da 300,00 e 200,00: il totale e 1500,00,
    // non 2000,00. Ogni conto entra una volta sola.
    const accounts = [
      account({ id: "revolut", balanceCents: 100000 }),
      account({ id: "pocket-viaggi", parentId: "revolut", balanceCents: 30000, category: "pocket" }),
      account({ id: "pocket-auto", parentId: "revolut", balanceCents: 20000, category: "pocket" }),
    ];
    const result = computeNetWorth(accounts, "EUR", rates);
    expect(result.totalCents).toBe(150000);
    expect(result.byCategory.pocket).toBe(50000);
    expect(result.byCategory.operational).toBe(100000);
  });

  it("tiene fuori dal liquido i conti non liquidi", () => {
    const result = computeNetWorth(
      [
        account({ id: "conto", balanceCents: 100000 }),
        account({ id: "etf", balanceCents: 500000, liquid: false, category: "investments" }),
      ],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(600000);
    expect(result.liquidCents).toBe(100000);
    expect(result.byCategory.investments).toBe(500000);
  });

  it("esclude i conti archiviati", () => {
    const result = computeNetWorth(
      [
        account({ id: "attivo", balanceCents: 100000 }),
        account({ id: "chiuso", balanceCents: 999999, archived: true }),
      ],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(100000);
  });

  it("converte un conto in valuta diversa col tasso del giorno", () => {
    const result = computeNetWorth(
      [account({ id: "usd", currency: "USD", balanceCents: 100000 })],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(92166);
  });

  it("preferisce il tasso salvato nello snapshot a quello corrente", () => {
    // Lo storico non cambia se cambiano i tassi: con rateToBase fissato a 1,
    // il saldo entra 1:1 anche se oggi il cambio e diverso.
    const result = computeNetWorth(
      [account({ id: "usd", currency: "USD", balanceCents: 100000, rateToBase: 1 })],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(100000);
  });

  it("salta i conti senza tasso e li segnala", () => {
    const result = computeNetWorth(
      [
        account({ id: "eur", balanceCents: 100000 }),
        account({ id: "sek", currency: "SEK", balanceCents: 500000 }),
      ],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(100000);
    expect(result.missingRates).toEqual(["SEK"]);
  });

  it("gestisce saldi negativi", () => {
    const result = computeNetWorth(
      [
        account({ id: "conto", balanceCents: 100000 }),
        account({ id: "carta", balanceCents: -40000 }),
      ],
      "EUR",
      rates,
    );
    expect(result.totalCents).toBe(60000);
  });

  it("su nessun conto restituisce zero", () => {
    const result = computeNetWorth([], "EUR", rates);
    expect(result.totalCents).toBe(0);
    expect(result.byCategory.pocket).toBe(0);
  });
});

describe("ownBalanceInBase", () => {
  it("non converte se la valuta coincide con la base", () => {
    expect(ownBalanceInBase(account({ id: "a", balanceCents: 1234 }), "EUR", {})).toBe(1234);
  });

  it("restituisce null senza tasso disponibile", () => {
    expect(
      ownBalanceInBase(account({ id: "a", currency: "SEK", balanceCents: 1234 }), "EUR", {}),
    ).toBeNull();
  });
});

describe("totalWithChildren", () => {
  const accounts = [
    account({ id: "revolut", balanceCents: 100000 }),
    account({ id: "p1", parentId: "revolut", balanceCents: 30000, category: "pocket" }),
    account({ id: "p2", parentId: "revolut", balanceCents: 20000, category: "pocket" }),
    account({ id: "p2a", parentId: "p2", balanceCents: 5000, category: "pocket" }),
    account({ id: "bper", balanceCents: 700000 }),
  ];

  it("somma il conto e tutti i suoi discendenti", () => {
    expect(totalWithChildren(accounts, "revolut", "EUR", rates)).toBe(155000);
  });

  it("su un conto senza figli vale il suo saldo", () => {
    expect(totalWithChildren(accounts, "bper", "EUR", rates)).toBe(700000);
  });

  it("resta un dato di visualizzazione: il patrimonio totale non lo somma", () => {
    const net = computeNetWorth(accounts, "EUR", rates);
    expect(net.totalCents).toBe(855000);
  });
});

describe("buildAccountTree", () => {
  it("annida i Pocket sotto il conto padre, in ordine di nome", () => {
    const roots = buildAccountTree([
      { id: "b", parentId: null, name: "BPER" },
      { id: "p2", parentId: "r", name: "Viaggi" },
      { id: "r", parentId: null, name: "Revolut" },
      { id: "p1", parentId: "r", name: "Auto" },
    ]);
    expect(roots.map((r) => r.id)).toEqual(["b", "r"]);
    const revolut = roots.find((r) => r.id === "r");
    expect(revolut?.children.map((c) => c.name)).toEqual(["Auto", "Viaggi"]);
    expect(revolut?.children[0]?.depth).toBe(1);
  });

  it("tratta come radice un conto il cui padre non esiste piu", () => {
    const roots = buildAccountTree([{ id: "orfano", parentId: "spento", name: "Orfano" }]);
    expect(roots.map((r) => r.id)).toEqual(["orfano"]);
  });

  it("appiattisce l'albero in ordine di visita", () => {
    const roots = buildAccountTree([
      { id: "r", parentId: null, name: "Revolut" },
      { id: "p", parentId: "r", name: "Auto" },
      { id: "b", parentId: null, name: "BPER" },
    ]);
    expect(flattenTree(roots).map((n) => n.id)).toEqual(["b", "r", "p"]);
  });
});
