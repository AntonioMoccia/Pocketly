# Architettura

Note per chi mette le mani nel codice. Le specifiche di prodotto stanno in
[`spec.md`](spec.md) e [`spec-movimenti-e-buste.md`](spec-movimenti-e-buste.md);
il disegno dell'interfaccia in [`ui-desktop-e-mobile.pdf`](ui-desktop-e-mobile.pdf).

## Struttura

Un monorepo con workspace npm e tre pacchetti:

| Pacchetto | Cosa contiene | Cosa non deve conoscere |
| --- | --- | --- |
| `packages/domain` | Dominio puro: denaro, cambi, ripartizione, buste, regole, CSV, date | il database, React, HTTP |
| `apps/api` | API REST NestJS: accesso ai dati (`src/data`, sempre filtrato per `householdId`), schema e migrazioni (`src/db`), autenticazione, job | React |
| `apps/web` | Frontend Next.js: pagine, Server Action, interfaccia | SQL, il database |

Il dominio sta in un pacchetto a sé perché è la parte che non può sbagliare:
essendo fatto di funzioni pure si prova con test veloci, senza database e senza
browser, e lo usano sia l'API sia il frontend (per esempio per formattare gli
importi). Tutto ciò che riguarda i soldi vive lì.

### Come parlano frontend e API

L'API è l'unico servizio che apre una connessione a Postgres. Il frontend la
chiama dal server (pagine e Server Action) con `src/lib/api.ts`, passando il
cookie di sessione dell'utente; i moduli in `apps/web/src/data` espongono le
letture con gli stessi nomi delle funzioni di `apps/api/src/data`, senza
`householdId`, che l'API ricava dalla sessione e non accetta mai dal client.

Le scritture passano dalle Server Action, che leggono il form, convertono gli
importi scritti dall'utente in centesimi (la lingua la conosce il frontend) e
chiamano un endpoint; l'API valida di nuovo con zod e risponde agli errori con
un codice stabile (`{ code }`), che il frontend traduce.

Better Auth vive nell'API, ma il browser la raggiunge dall'indirizzo del sito:
`apps/web/src/app/api/auth/[...all]/route.ts` inoltra le richieste così come
sono. Cookie e passkey restano legati al dominio che l'utente vede, e
`BETTER_AUTH_URL` è l'URL pubblico del frontend.

Gli endpoint stanno sotto `/api/v1`. Un controllo globale (`AccessGuard`)
richiede sessione e household a ogni richiesta; i decoratori `@Public()`,
`@SessionOnly()`, `@Writable()` e `@OwnerOnly()` allargano o stringono.

## Regole di dominio

Sono poche e governano gran parte del codice.

**Il denaro è un intero.** Gli importi sono unità minori (centesimi) su colonne
`bigint`, mai float, sempre accompagnati da un codice valuta ISO 4217. Somme e
sottrazioni fra interi sono esatte; le moltiplicazioni (percentuali, cambi)
passano da un arrotondamento esplicito. Quando una ripartizione non torna per
un centesimo, il resto va alla quota con la parte frazionaria maggiore
(`distribute`): così non si perde né si crea denaro.

**Il saldo sta sui Pocket.** Un Pocket è un `account` con `parent_id`, sempre
direttamente sotto un conto principale. Ogni conto principale nasce con un
Pocket di default (`is_default`, "Principale") che tiene i soldi non messi da
parte. Il conto non ha un saldo suo: i saldi si registrano solo sui Pocket e il
totale del conto è la loro somma (`withPocketTotals`, `totalWithChildren`). Il
patrimonio (`computeNetWorth`) somma i Pocket e salta i contenitori, così
niente si conta due volte. Il Pocket di default segue il suo conto: non cambia
conto, non si archivia e non si elimina da solo.

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

Girano nel processo dell'API (`apps/api/src/jobs`), su coda pg-boss in
Postgres: niente Redis, e nessun servizio in più oltre a quello che parla già
col database. Si spengono con `DISABLE_JOBS=true`.

| Job | Quando | Cosa fa |
| --- | --- | --- |
| `fx-rates` | giorni feriali, 16:30 | Scarica i tassi BCE |
| `net-worth-snapshot` | primo del mese | Salva lo snapshot per ogni household |
| `match-transfers` | ogni 6 ore | Abbina i giroconti e spunta i bonifici |

## Interfaccia

I token di colore stanno una volta sola in `apps/web/src/app/globals.css`, in tre
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
