# Pocketly — Movimenti e buste

Oct 14, 2026 · @Antonio

Ogni entrata viene letta, ripartita da te in buste, e ogni spesa letta dalla banca o dal CSV viene categorizzata e scalata dalla busta giusta: piano e realtà nello stesso posto.

## Principio

La ripartizione è il piano (dove vuoi che vada ogni euro), i movimenti sono la realtà (dove è andato): l'app li tiene entrambi e li confronta. Ogni passo va a chi lo sa fare meglio, l'app o tu.

| Momento | Chi lo fa | Fase |
| --- | --- | --- |
| Arriva un'entrata | L'app la riconosce e apre il giorno di paga con l'importo già scritto; senza banca o CSV la scrivi tu | 1 manuale · 1.5 da CSV · 2 da banca |
| Ripartizione in buste | Tu confermi la proposta del modello: è una decisione, nessuna banca può saperla | 1 |
| Bonifici della ripartizione | L'app riconosce i giroconti e spunta *Fatto* da sola | 1.5 |
| Spese | Lette, categorizzate dalle regole, scalate dalla busta | 1.5 |
| Sforamenti | L'app chiede da quale busta coprire | 1.5 |
| Fine mese | Avanzi gestiti busta per busta, previsto e speso a confronto | 1.5 |

| Approccio scartato | Perché |
| --- | --- |
| Solo ripartizione a mano | Non dice quanto hai speso davvero; saldi sempre a mano |
| Solo lettura dei movimenti | Guarda solo il passato: nessun piano, nessuna decisione |

## Categoria e busta

Ogni spesa ha due etichette indipendenti: la categoria dice cosa hai comprato, la busta da quali soldi l'hai pagato. Ogni categoria ha una busta predefinita, così categorizzare una spesa basta anche a scalarla.

| Asse | Domanda | Esempi | Serve a |
| --- | --- | --- | --- |
| Categoria | Cosa ho comprato? | Ristoranti, Spesa, Carburante, Abbonamenti | Analisi: dove vanno i soldi, mese su mese |
| Busta | Con quali soldi? | Sfizi, Auto, Spesa, Palestra | Budget: quanto resta da spendere |

| Categoria | Busta predefinita | Tipo busta |
| --- | --- | --- |
| Ristoranti, Bar | Sfizi | Reale (Pocket Revolut) |
| Carburante, Manutenzione auto | Auto | Reale (Pocket Revolut) |
| Spesa alimentare | Spesa | Virtuale (saldo principale Revolut) |
| Abbonamenti, Rata auto | Fisse | Virtuale (conto BPER) |
| Abbigliamento | Abbigliamento | Reale (Pocket Revolut) |

La tabella è un esempio di configurazione iniziale: categorie e associazioni sono modificabili, e una singola spesa può sempre essere spostata su un'altra busta.

## Il percorso di una spesa

&#91;embedded content: percorso di una spesa · 2 decisioni, 2 azioni collaterali\]

I giroconti tra conti propri escono subito dal conteggio; tutto il resto arriva a una busta, e ogni incoerenza tra busta e conto reale genera un'azione da fare.

## Regole delle buste

Le buste virtuali si spostano con un clic, i soldi reali no: ogni volta che le due cose divergono, l'app trasforma la differenza in un giroconto da fare, altrimenti i saldi mentono.

| Caso | Comportamento |
| --- | --- |
| Busta reale | Corrisponde a un Pocket o a un conto. Disponibile = saldo reale del Pocket |
| Busta virtuale | Vive dentro un conto reale (es. Spesa nel saldo principale Revolut). Disponibile = assegnato − speso + spostamenti ricevuti − spostamenti ceduti |
| Spesa pagata da un Pocket | Vince il Pocket, qualunque sia la categoria |
| Spesa pagata dal conto "sbagliato" | Pizzeria da 28 € pagata dal saldo principale, busta Sfizi (Pocket): l'app scala Sfizi e propone il giroconto Pocket Sfizi → saldo principale da 28 € |
| Avanzi a fine mese | Politica scelta per ogni busta: **Accumula** (resta e si somma al mese dopo) oppure **Svuota in** una busta di destinazione |
| Svuota su busta reale | Diventa un bonifico nella checklist del giorno di paga successivo |
| Sforamento | Quando il disponibile va sotto 0, si apre "Copri da": scegli busta e importo. L'app sposta l'assegnato e, se le due buste stanno su conti diversi, aggiunge il giroconto alla lista "Da fare" |
| Coerenza dei saldi | Per ogni conto reale: somma delle buste virtuali + non assegnato = saldo reale. Se non torna, l'app mostra la differenza e propone di attribuirla (interessi, commissioni, spesa non importata) |

**Default suggeriti per gli avanzi**

| Busta | Politica | Motivo |
| --- | --- | --- |
| Auto, Abbigliamento, Aruba, Università | Accumula | Spese irregolari: servono riserve |
| Sfizi, Spesa | Svuota in Fondo emergenza | Spese correnti: l'avanzo è risparmio |
| Fisse | Accumula | Gli addebiti arrivano in date diverse dal giorno di paga |

## Modello dati

La busta diventa l'unità del budget: la ripartizione assegna a buste, le spese consumano buste, i giroconti tengono allineati i conti reali. Le modifiche sono già riportate nella spec.

| Tabella o campo | Contenuto | Novità |
| --- | --- | --- |
| `envelopes` | id, household\_id, nome, tipo (reale, virtuale), account\_id, politica\_avanzi (accumula, svuota), destinazione\_avanzi\_id, colore, archiviata | Nuova |
| `envelope_moves` | id, da\_envelope\_id, a\_envelope\_id, importo, data, motivo (sforamento, avanzo, manuale), transfer\_todo\_id | Nuova |
| `transfer_todos` | id, da\_account\_id, a\_account\_id, importo, motivo, stato (da fare, fatto), transaction\_id | Nuova: giroconti generati da sforamenti, avanzi e spese dal conto sbagliato |
| `categories.default_envelope_id` | Busta predefinita della categoria | Campo nuovo |
| `transactions.envelope_id` | Busta da cui la spesa è scalata | Campo nuovo |
| `allocations.envelope_id` | La riga di ripartizione punta a una busta, non a un conto | Sostituisce account\_id |
| `import_profiles` | household\_id, banca, mappatura colonne, formato data, separatore decimale | Nuova (fase 1.5) |

**Calcolo del disponibile di una busta virtuale nel mese:** riporto del mese precedente + assegnato + spostamenti ricevuti − spostamenti ceduti − spese. Il riporto è 0 se la politica è Svuota.

## Fase 1.5 — Movimenti da CSV

Obiettivo: movimenti, categorie e buste funzionanti con gli estratti conto, prima di collegare le banche. Durata stimata 2-3 settimane; valida subito la categorizzazione, il rischio principale del progetto, senza dipendere dai termini di Enable Banking.

**Funzioni**

| # | Funzione | Dettaglio |
| --- | --- | --- |
| F1.5.1 | Import CSV/XLS | Profili per banca, anteprima, deduplica su data + importo + descrizione; import ripetibile senza doppioni |
| F1.5.2 | Categorie | Albero predefinito IT/EN, modificabile, con busta predefinita per categoria |
| F1.5.3 | Regole | Descrizione, controparte, importo → categoria; dopo ogni correzione manuale l'app propone la regola |
| F1.5.4 | Buste | Reali e virtuali, politica avanzi per busta, colore |
| F1.5.5 | Disponibile per busta | Calcolato in tempo reale; visibile in dashboard e nel dettaglio busta |
| F1.5.6 | Copri sforamento | Pannello "Copri da" con buste suggerite (più disponibile, stesso conto prima) |
| F1.5.7 | Giroconti da fare | Lista unica generata da sforamenti, avanzi e spese dal conto sbagliato; si spuntano quando il giroconto compare nei movimenti |
| F1.5.8 | Riconoscimento entrate | Regola "entrata da \[controparte\] sopra \[soglia\]" apre il giorno di paga con l'importo |
| F1.5.9 | Chiusura mese | Applica le politiche avanzi e mostra previsto vs speso per busta e per categoria |
| F1.5.10 | Coerenza | Avviso quando buste + non assegnato ≠ saldo reale del conto |

**Schermate nuove**

1. Movimenti (lista con filtri per conto, busta, categoria, "da categorizzare")
2. Dettaglio movimento (categoria, busta, crea regola)
3. Import CSV (caricamento, mappatura colonne, anteprima)
4. Dettaglio busta (disponibile, assegnato, speso, storico, politica avanzi)
5. Copri sforamento (pannello)
6. Giroconti da fare
7. Chiusura mese

**Criteri di accettazione**

- [ ] Lo stesso CSV importato due volte non crea doppioni
- [ ] Al secondo mese almeno l'80% dei movimenti è categorizzato dalle regole
- [ ] Ogni sforamento si chiude con una copertura o resta visibile come "da coprire"
- [ ] Per ogni conto reale buste + non assegnato coincidono con il saldo, oppure la differenza è segnalata
- [ ] La chiusura mese applica Accumula e Svuota come impostato e genera i giroconti necessari

| Pro della fase 1.5 | Contro |
| --- | --- |
| Valida la categorizzazione con dati reali prima delle API bancarie | Banche collegate 2-3 settimane più tardi |
| Il CSV evita l'inserimento manuale delle spese | Import manuale periodico fino alla fase 2 |
| In fase 2 cambia solo la fonte dei movimenti: buste e regole restano | — |

## Domande aperte

- [ ] Formato degli estratti conto esportabili da BPER, Revolut e Trade Republic (colonne, separatori, codifica)
- [ ] Una spesa può essere divisa su più buste o categorie (es. scontrino supermercato con spesa e casa)?
- [ ] Nelle coppie: una busta comune è un conto cointestato o una busta virtuale condivisa dentro conti personali?
- [ ] Rimborsi e resi: tornano nella busta originale o nel non assegnato?
- [ ] Soglia e controparte per riconoscere lo stipendio, e regola per le entrate irregolari dei freelance
