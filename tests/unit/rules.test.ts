import { describe, expect, it } from "vitest";
import {
  applyRules,
  looksLikeIncome,
  matchTransfers,
  merchantToken,
  normalize,
  ruleMatches,
  suggestRule,
  type Rule,
} from "@/lib/rules";

const rule = (partial: Partial<Rule> & { id: string }): Rule => ({
  field: "description",
  operator: "contains",
  value: "",
  categoryId: "cat",
  envelopeId: null,
  priority: 0,
  enabled: true,
  ...partial,
});

const tx = (description: string, amountCents = -2800, counterparty: string | null = null) => ({
  description,
  counterparty,
  amountCents,
});

describe("normalize", () => {
  it("toglie accenti, maiuscole e spazi doppi", () => {
    expect(normalize("  Caffè   DELLA  Posta ")).toBe("caffe della posta");
  });
});

describe("ruleMatches", () => {
  it("confronta la descrizione senza badare ad accenti e maiuscole", () => {
    expect(ruleMatches(rule({ id: "r", value: "pizzeria" }), tx("PIZZERIA DA GENNARO"))).toBe(true);
    expect(ruleMatches(rule({ id: "r", value: "caffe" }), tx("Caffè della Posta"))).toBe(true);
  });

  it("gestisce equals e starts_with", () => {
    expect(ruleMatches(rule({ id: "r", operator: "equals", value: "conad" }), tx("Conad"))).toBe(true);
    expect(ruleMatches(rule({ id: "r", operator: "equals", value: "conad" }), tx("Conad City"))).toBe(false);
    expect(ruleMatches(rule({ id: "r", operator: "starts_with", value: "q8" }), tx("Q8 rifornimento"))).toBe(true);
  });

  it("confronta la controparte quando richiesto", () => {
    const r = rule({ id: "r", field: "counterparty", value: "netflix" });
    expect(ruleMatches(r, tx("Addebito", -1399, "Netflix International"))).toBe(true);
    expect(ruleMatches(r, tx("Netflix", -1399, null))).toBe(false);
  });

  it("confronta gli importi in unita principali, sul valore assoluto", () => {
    const r = rule({ id: "r", field: "amount", operator: "greater_than", value: "100" });
    expect(ruleMatches(r, tx("Spesa grossa", -15000))).toBe(true);
    expect(ruleMatches(r, tx("Spesa piccola", -5000))).toBe(false);
  });

  it("accetta la virgola nelle soglie", () => {
    const r = rule({ id: "r", field: "amount", operator: "less_than", value: "12,50" });
    expect(ruleMatches(r, tx("Caffe", -200))).toBe(true);
  });

  it("una regola disattivata non corrisponde mai", () => {
    expect(ruleMatches(rule({ id: "r", value: "pizzeria", enabled: false }), tx("Pizzeria"))).toBe(false);
  });

  it("un valore vuoto non corrisponde a tutto", () => {
    expect(ruleMatches(rule({ id: "r", value: "" }), tx("Qualunque cosa"))).toBe(false);
  });
});

describe("applyRules", () => {
  it("vince la regola con priorita piu bassa", () => {
    const rules = [
      rule({ id: "b", value: "pizzeria", categoryId: "ristoranti", priority: 2 }),
      rule({ id: "a", value: "pizzeria", categoryId: "sfizi", priority: 1 }),
    ];
    expect(applyRules(rules, tx("Pizzeria Da Gennaro")).categoryId).toBe("sfizi");
  });

  it("restituisce la busta della regola", () => {
    const rules = [rule({ id: "a", value: "q8", categoryId: "carburante", envelopeId: "auto" })];
    expect(applyRules(rules, tx("Q8 rifornimento")).envelopeId).toBe("auto");
  });

  it("senza corrispondenze non categorizza", () => {
    expect(applyRules([rule({ id: "a", value: "ikea" })], tx("Amazon")).categoryId).toBeNull();
  });
});

describe("merchantToken", () => {
  it("estrae il nome dell'esercente dalla descrizione bancaria", () => {
    expect(merchantToken("PAGAMENTO POS 13/10 PIZZERIA DA GENNARO 28,00 EUR")).toBe("PIZZERIA DA");
    expect(merchantToken("Conad City")).toBe("CONAD CITY");
  });

  it("non propone nulla da una descrizione fatta solo di codici", () => {
    expect(merchantToken("0012345 99/88 ***")).toBeNull();
  });
});

describe("suggestRule", () => {
  it("propone una regola sulla controparte quando c'e", () => {
    const suggestion = suggestRule(tx("Addebito", -1399, "Netflix International BV"), "abbonamenti", "fisse");
    expect(suggestion?.field).toBe("counterparty");
    expect(suggestion?.value).toBe("NETFLIX INTERNATIONAL");
    expect(suggestion?.categoryId).toBe("abbonamenti");
    expect(suggestion?.envelopeId).toBe("fisse");
  });

  it("ripiega sulla descrizione", () => {
    const suggestion = suggestRule(tx("AMAZON MARKETPLACE"), "casa", "spesa");
    expect(suggestion?.field).toBe("description");
    expect(suggestion?.value).toBe("AMAZON MARKETPLACE");
  });
});

describe("matchTransfers", () => {
  const candidates = [
    { id: "out", accountId: "bper", bookedDate: "2026-10-14", amountCents: -40500, description: "Bonifico" },
    { id: "in", accountId: "revolut", bookedDate: "2026-10-15", amountCents: 40500, description: "Da BPER" },
    { id: "spesa", accountId: "revolut", bookedDate: "2026-10-13", amountCents: -4680, description: "Conad" },
  ];

  it("abbina uscita ed entrata di pari importo tra conti propri", () => {
    expect(matchTransfers(candidates)).toEqual([{ outId: "out", inId: "in" }]);
  });

  it("non abbina oltre la finestra di giorni", () => {
    const late = [
      candidates[0]!,
      { ...candidates[1]!, bookedDate: "2026-10-25" },
    ];
    expect(matchTransfers(late)).toEqual([]);
  });

  it("non abbina movimenti sullo stesso conto", () => {
    const sameAccount = [
      candidates[0]!,
      { ...candidates[1]!, accountId: "bper" },
    ];
    expect(matchTransfers(sameAccount)).toEqual([]);
  });

  it("non usa due volte la stessa entrata", () => {
    const twoOut = [
      { id: "out1", accountId: "bper", bookedDate: "2026-10-14", amountCents: -10000, description: "a" },
      { id: "out2", accountId: "bper", bookedDate: "2026-10-14", amountCents: -10000, description: "b" },
      { id: "in1", accountId: "revolut", bookedDate: "2026-10-14", amountCents: 10000, description: "c" },
    ];
    const pairs = matchTransfers(twoOut);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.inId).toBe("in1");
  });

  it("a parita di importo preferisce la data piu vicina", () => {
    const rows = [
      { id: "out", accountId: "bper", bookedDate: "2026-10-14", amountCents: -10000, description: "a" },
      { id: "far", accountId: "revolut", bookedDate: "2026-10-17", amountCents: 10000, description: "b" },
      { id: "near", accountId: "revolut", bookedDate: "2026-10-14", amountCents: 10000, description: "c" },
    ];
    expect(matchTransfers(rows)[0]?.inId).toBe("near");
  });
});

describe("looksLikeIncome", () => {
  it("riconosce lo stipendio sopra soglia", () => {
    expect(
      looksLikeIncome(tx("Bonifico stipendio", 154200, "Azienda Srl"), {
        counterparty: "Azienda",
        minAmountCents: 50000,
      }),
    ).toBe(true);
  });

  it("scarta gli importi sotto soglia", () => {
    expect(
      looksLikeIncome(tx("Bonifico", 10000, "Azienda Srl"), {
        counterparty: "Azienda",
        minAmountCents: 50000,
      }),
    ).toBe(false);
  });

  it("scarta le uscite", () => {
    expect(looksLikeIncome(tx("Bonifico", -154200), { minAmountCents: 50000 })).toBe(false);
  });

  it("senza controparte attesa basta la soglia", () => {
    expect(looksLikeIncome(tx("Accredito", 200000), { minAmountCents: 50000 })).toBe(true);
  });
});
