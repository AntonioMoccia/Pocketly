import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  fingerprint,
  guessColumnMap,
  mapRows,
  parseCsv,
  parseDate,
} from "@/lib/csv";

describe("parseCsv", () => {
  it("legge un CSV con virgole", () => {
    const table = parseCsv("Date,Description,Amount\n2026-10-13,Conad,-46.80");
    expect(table.headers).toEqual(["Date", "Description", "Amount"]);
    expect(table.rows).toEqual([["2026-10-13", "Conad", "-46.80"]]);
  });

  it("riconosce il punto e virgola delle banche italiane", () => {
    const table = parseCsv("Data;Causale;Importo\n13/10/2026;Conad;-46,80");
    expect(table.delimiter).toBe(";");
    expect(table.rows[0]).toEqual(["13/10/2026", "Conad", "-46,80"]);
  });

  it("gestisce i campi tra virgolette con il separatore dentro", () => {
    const table = parseCsv('Date,Description\n2026-10-13,"Conad, City"');
    expect(table.rows[0]).toEqual(["2026-10-13", "Conad, City"]);
  });

  it("gestisce le virgolette raddoppiate", () => {
    const table = parseCsv('A\n"dice ""ciao"""');
    expect(table.rows[0]).toEqual(['dice "ciao"']);
  });

  it("toglie il BOM e regge le fine riga Windows", () => {
    const table = parseCsv('﻿Date,Amount\r\n2026-10-13,-1.00\r\n');
    expect(table.headers).toEqual(["Date", "Amount"]);
    expect(table.rows).toHaveLength(1);
  });

  it("salta le righe vuote", () => {
    const table = parseCsv("A,B\n1,2\n\n3,4\n");
    expect(table.rows).toHaveLength(2);
  });
});

describe("detectDelimiter", () => {
  it("non si fa ingannare dai separatori dentro le virgolette", () => {
    expect(detectDelimiter('Data;Causale;Importo\n13/10;"a,b,c,d,e";-1,00')).toBe(";");
  });
});

describe("parseDate", () => {
  it("legge le date ISO, anche con l'ora", () => {
    expect(parseDate("2026-10-13")).toBe("2026-10-13");
    expect(parseDate("2026-10-13 21:14")).toBe("2026-10-13");
  });

  it("legge il formato europeo giorno/mese", () => {
    expect(parseDate("13/10/2026")).toBe("2026-10-13");
    expect(parseDate("13.10.2026")).toBe("2026-10-13");
    expect(parseDate("13-10-26")).toBe("2026-10-13");
  });

  it("su date ambigue assume giorno/mese", () => {
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
  });

  it("rispetta il formato dichiarato", () => {
    expect(parseDate("05/10/2026", "MM/DD/YYYY")).toBe("2026-05-10");
  });

  it("riconosce il mese quando il primo numero non puo essere un mese", () => {
    expect(parseDate("25/10/2026")).toBe("2026-10-25");
  });

  it("rifiuta date impossibili e testo", () => {
    expect(parseDate("32/13/2026")).toBeNull();
    expect(parseDate("ieri")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("mapRows", () => {
  const map = { date: "Date", description: "Description", amount: "Amount", currency: "Currency" };

  it("trasforma le righe in movimenti", () => {
    const table = parseCsv(
      "Date,Description,Amount,Currency\n2026-10-13,Pizzeria Da Gennaro,-28.00,EUR",
    );
    const result = mapRows(table, map);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      date: "2026-10-13",
      description: "Pizzeria Da Gennaro",
      amountCents: -2800,
      currency: "EUR",
    });
  });

  it("raccoglie le righe illeggibili senza fermare le altre", () => {
    const table = parseCsv(
      "Date,Description,Amount\n2026-10-13,Buona,-28.00\nieri,Rotta,-10.00\n2026-10-14,Altra,-5.00",
    );
    const result = mapRows(table, map);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 3, reason: "date" });
  });

  it("legge due colonne dare e avere", () => {
    const table = parseCsv("Data;Causale;Uscite;Entrate\n13/10/2026;Conad;46,80;\n14/10/2026;Stipendio;;1542,00");
    const result = mapRows(table, {
      date: "Data",
      description: "Causale",
      amount: "",
      debit: "Uscite",
      credit: "Entrate",
    });
    expect(result.rows[0]?.amountCents).toBe(-4680);
    expect(result.rows[1]?.amountCents).toBe(154200);
  });

  it("legge la notazione italiana degli importi", () => {
    const table = parseCsv("Data;Causale;Importo\n13/10/2026;Spesa;-1.234,56");
    const result = mapRows(table, { date: "Data", description: "Causale", amount: "Importo" });
    expect(result.rows[0]?.amountCents).toBe(-123456);
  });

  it("trova le colonne senza badare alle maiuscole", () => {
    const table = parseCsv("DATE,DESCRIPTION,AMOUNT\n2026-10-13,Conad,-46.80");
    expect(mapRows(table, map).rows).toHaveLength(1);
  });
});

describe("fingerprint", () => {
  it("la stessa riga da la stessa impronta", () => {
    const row = { date: "2026-10-13", amountCents: -2800, description: "Pizzeria Da Gennaro" };
    expect(fingerprint(row)).toBe(fingerprint({ ...row }));
  });

  it("non distingue per maiuscole, accenti o spazi doppi", () => {
    expect(fingerprint({ date: "2026-10-13", amountCents: -2800, description: "Caffè  Posta" })).toBe(
      fingerprint({ date: "2026-10-13", amountCents: -2800, description: "caffe posta" }),
    );
  });

  it("distingue importi e date diverse", () => {
    const base = { date: "2026-10-13", amountCents: -2800, description: "Conad" };
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, amountCents: -2900 }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, date: "2026-10-14" }));
  });
});

describe("guessColumnMap", () => {
  it("riconosce le intestazioni di Revolut", () => {
    const guess = guessColumnMap(["Type", "Completed Date", "Description", "Amount", "Currency", "State"]);
    expect(guess.date).toBe("Completed Date");
    expect(guess.description).toBe("Description");
    expect(guess.amount).toBe("Amount");
    expect(guess.currency).toBe("Currency");
  });

  it("riconosce le intestazioni italiane", () => {
    const guess = guessColumnMap(["Data contabile", "Causale", "Uscite", "Entrate"]);
    expect(guess.date).toBe("Data contabile");
    expect(guess.description).toBe("Causale");
    expect(guess.debit).toBe("Uscite");
    expect(guess.credit).toBe("Entrate");
  });
});
