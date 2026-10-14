# Architettura

Note per chi mette le mani nel codice. Le specifiche di prodotto stanno in
[`spec.md`](spec.md) e [`spec-movimenti-e-buste.md`](spec-movimenti-e-buste.md);
il disegno dell'interfaccia in [`ui-desktop-e-mobile.pdf`](ui-desktop-e-mobile.pdf).

## I tre strati

| Cartella | Cosa contiene | Cosa non deve conoscere |
| --- | --- | --- |
| `src/lib` | Dominio puro: denaro, cambi, ripartizione, buste, regole, CSV, date | il database, React |
| `src/server` | Accesso ai dati, sempre filtrato per `householdId` | React |
| `src/app` | Pagine, Server Action, interfaccia | SQL |

Il dominio sta in `src/lib` perché è la parte che non può sbagliare: essendo
fatta di funzioni pure si prova con test veloci, senza database e senza
browser. Tutto ciò che riguarda i soldi vive lì.

## Regole di dominio

Sono poche e governano gran parte del codice.

**Il denaro è un intero.** Gli importi sono unità minori (centesimi) su colonne
`bigint`, mai float, sempre accompagnati da un codice valuta ISO 4217. Somme e
sottrazioni fra interi sono esatte; le moltiplicazioni (percentuali, cambi)
passano da un arrotondamento esplicito. Quando una ripartizione non torna per
un centesimo, il resto va alla quota con la parte frazionaria maggiore
(`distribute`): così non si perde né si crea denaro.

**Ogni conto conta una volta sola.** Un Pocket è un `account` con `parent_id`.
Il totale di un conto comprensivo dei suoi Pocket (`totalWithChildren`) è un
dato di sola lettura e non entra mai nel patrimonio, che somma i saldi propri
(`computeNetWorth`).

**Lo storico non si riscrive.** Il tasso di cambio usato per un saldo viene
salvato nella riga dello snapshot (`balance_snapshots.rate_to_base`) e ha la
precedenza su quello corrente. Un totale di marzo resta quello di marzo anche
se i cambi si muovono.

**Il giorno di paga si chiude solo a zero.** `canClosePayday` richiede
"da assegnare" a 0 e ogni riga con importo spuntata. La riga "resto" assorbe la
differenza, quindi il piano combacia sempre con l'entrata.

**Le buste virtuali si spostano, i soldi reali no.** Ogni volta che le due cose
divergono — una copertura fra buste su conti diversi, un avanzo di fine mese,
una spesa pagata dal conto sbagliato — nasce un `transfer_todo`, che si spunta
da solo quando il giroconto compare fra i movimenti importati.

## Il riporto delle buste

Il riporto da un mese all'altro non è salvato da nessuna parte: è la somma di
tutto ciò che è successo alla busta prima dell'inizio del mese
(`assegnato + ricevuti − ceduti − speso`). La chiusura del mese scrive uno
spostamento vero per le buste con politica "svuota", così il conto torna anche
guardando indietro di un anno, e chiudere due volte lo stesso mese non sposta
nulla (`month_closes` lo impedisce).

## Isolamento fra household

Ogni tabella di dominio ha `household_id` e ogni query lo filtra. Il
`householdId` arriva solo da `requireContext()` / `requireWritableContext()`,
mai da un parametro dell'utente. Nell'edizione gestita (fase 4) si aggiungerà
la Row Level Security di Postgres come seconda barriera, senza toccare le
query.

## Job pianificati

Girano nel processo del server, avviati da `src/instrumentation.ts`, su coda
pg-boss in Postgres: niente Redis e un solo processo da sorvegliare. Si
spengono con `DISABLE_JOBS=true`.

| Job | Quando | Cosa fa |
| --- | --- | --- |
| `fx-rates` | giorni feriali, 16:30 | Scarica i tassi BCE |
| `net-worth-snapshot` | primo del mese | Salva lo snapshot per ogni household |
| `match-transfers` | ogni 6 ore | Abbina i giroconti e spunta i bonifici |

## Interfaccia

I token di colore stanno una volta sola in `src/app/globals.css`, in tre
blocchi: `:root` per il chiaro, la media query per l'impostazione di sistema,
lo scope `data-theme` per l'interruttore manuale.

I cinque colori di categoria sono una palette verificata per separazione
daltonica e contrasto su entrambe le superfici. Rispetto al file di design,
"Pocket" e "Capitale garantito" si scambiano viola e ambra: nel disegno
originale viola e blu finivano adiacenti nella barra impilata, dove un occhio
deuteranope non li distingue (ΔE 1,9 contro una soglia di 8). Le tinte sono le
stesse, cambia solo quale categoria porta quale.

## Fasi successive

L'interfaccia `BankProvider` della fase 2 non è ancora scritta, ma il modello
dati la aspetta: `institutions.provider` e `providerRef`, `transactions.provider_ref`
per la deduplica, `balance_snapshots.source`. Passare dai CSV alle banche
collegate significa cambiare la fonte dei movimenti: buste, regole e
riconciliazione restano come sono.
