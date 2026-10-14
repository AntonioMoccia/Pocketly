import { describe, expect, it } from "vitest";
import {
  buildAccountTree,
  computeNetWorth,
  flattenTree,
  ownBalanceInBase,
  totalWithChildren,
  withPocketTotals,
  type AccountForTotals,
} from "@pocketly/domain/networth";

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

  it("conta i Pocket e non il conto che li contiene", () => {
    // Revolut con Principale 1000,00 e due Pocket da 300,00 e 200,00: il totale
    // e 1500,00. Il saldo del contenitore, anche se valorizzato, non entra.
    const accounts = [
      account({ id: "revolut", balanceCents: 150000 }),
      account({ id: "principale", parentId: "revolut", balanceCents: 100000 }),
      account({ id: "pocket-viaggi", parentId: "revolut", balanceCents: 30000, category: "pocket" }),
      account({ id: "pocket-auto", parentId: "revolut", balanceCents: 20000, category: "pocket" }),
    ];
    const result = computeNetWorth(accounts, "EUR", rates);
    expect(result.totalCents).toBe(150000);
    expect(result.byCategory.pocket).toBe(50000);
    expect(result.byCategory.operational).toBe(100000);
  });

  it("dopo withPocketTotals il totale resta lo stesso", () => {
    const accounts = withPocketTotals([
      { ...account({ id: "revolut" }), balanceDate: null },
      { ...account({ id: "principale", parentId: "revolut", balanceCents: 100000 }), balanceDate: null },
      { ...account({ id: "viaggi", parentId: "revolut", balanceCents: 30000 }), balanceDate: null },
    ]);
    expect(computeNetWorth(accounts, "EUR", rates).totalCents).toBe(130000);
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

describe("withPocketTotals", () => {
  const withDate = (a: AccountForTotals, balanceDate: string | null) => ({ ...a, balanceDate });

  it("porta sul contenitore la somma dei Pocket e la data piu recente", () => {
    const [revolut] = withPocketTotals([
      withDate(account({ id: "revolut", balanceCents: 999999, rateToBase: 1 }), "2026-01-01"),
      withDate(account({ id: "principale", parentId: "revolut", balanceCents: 100000 }), "2026-10-01"),
      withDate(account({ id: "viaggi", parentId: "revolut", balanceCents: 30000 }), "2026-10-10"),
    ]);
    expect(revolut?.balanceCents).toBe(130000);
    expect(revolut?.balanceDate).toBe("2026-10-10");
    expect(revolut?.rateToBase).toBeNull();
  });

  it("ignora i Pocket archiviati", () => {
    const [revolut] = withPocketTotals([
      withDate(account({ id: "revolut" }), null),
      withDate(account({ id: "principale", parentId: "revolut", balanceCents: 100000 }), null),
      withDate(account({ id: "chiuso", parentId: "revolut", balanceCents: 5000, archived: true }), null),
    ]);
    expect(revolut?.balanceCents).toBe(100000);
  });

  it("lascia invariati i conti senza Pocket e i Pocket", () => {
    const input = [
      withDate(account({ id: "bper", balanceCents: 700000 }), "2026-10-01"),
      withDate(account({ id: "r" }), null),
      withDate(account({ id: "p", parentId: "r", balanceCents: 100 }), null),
    ];
    const out = withPocketTotals(input);
    expect(out[0]).toBe(input[0]);
    expect(out[2]).toBe(input[2]);
  });
});

describe("totalWithChildren", () => {
  const accounts = [
    account({ id: "revolut", balanceCents: 150000 }),
    account({ id: "principale", parentId: "revolut", balanceCents: 100000 }),
    account({ id: "p1", parentId: "revolut", balanceCents: 30000, category: "pocket" }),
    account({ id: "p2", parentId: "revolut", balanceCents: 20000, category: "pocket" }),
    account({ id: "bper", balanceCents: 700000 }),
  ];

  it("su un contenitore somma solo i Pocket", () => {
    expect(totalWithChildren(accounts, "revolut", "EUR", rates)).toBe(150000);
  });

  it("converte ogni Pocket col tasso del suo snapshot", () => {
    const usd = [
      account({ id: "ibkr", currency: "USD" }),
      account({ id: "a", parentId: "ibkr", currency: "USD", balanceCents: 100000, rateToBase: 0.9 }),
      account({ id: "b", parentId: "ibkr", currency: "USD", balanceCents: 100000, rateToBase: 0.8 }),
    ];
    expect(totalWithChildren(usd, "ibkr", "EUR", rates)).toBe(170000);
  });

  it("su un conto senza Pocket vale il suo saldo", () => {
    expect(totalWithChildren(accounts, "bper", "EUR", rates)).toBe(700000);
  });

  it("su un Pocket vale il suo saldo", () => {
    expect(totalWithChildren(accounts, "p1", "EUR", rates)).toBe(30000);
  });

  it("il patrimonio non conta il contenitore", () => {
    expect(computeNetWorth(accounts, "EUR", rates).totalCents).toBe(850000);
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

  it("mette per primo il Pocket di default", () => {
    const roots = buildAccountTree([
      { id: "r", parentId: null, name: "Revolut" },
      { id: "a", parentId: "r", name: "Auto" },
      { id: "m", parentId: "r", name: "Principale", isDefault: true },
    ]);
    expect(roots[0]?.children.map((c) => c.id)).toEqual(["m", "a"]);
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
