# App budget multi-conto — Spec di prodotto

Oct 14, 2026 · @Antonio

## Visione e target

Un'app web che, a ogni entrata, dà una destinazione a ogni euro distribuendolo su più banche e Pocket, e tiene aggiornati patrimonio e obiettivi senza inserimenti manuali. Il vantaggio rispetto alle app delle banche è la vista unica su più istituti; rispetto a YNAB e simili, il flusso "giorno di paga" su conti reali multipli e il self-hosting.

| Target | Problema principale | Funzioni dedicate |
| --- | --- | --- |
| Dipendenti con più conti | Stipendio su una banca, spese e risparmi sparsi su altre e su Pocket | Ripartizione guidata, modelli ricorrenti, saldi automatici |
| Coppie e famiglie | Conti personali e comuni, spese da dividere | Household condiviso, conti personali o comuni, quote di contribuzione |
| Freelance e P.IVA | Entrate irregolari, tasse da accantonare | Ripartizione su ogni entrata (non solo mensile), accantonamento tasse in percentuale |

**Modello open core**

| Edizione | Chi la fa girare | Banche | Prezzo |
| --- | --- | --- | --- |
| Self-hosted | L'utente, con Docker | Chiave Enable Banking dell'utente, modalità ristretta | Gratis, licenza AGPL-3.0 |
| Hosted | Il titolare del progetto | Contratto commerciale con il provider | Abbonamento mensile o annuale |

**Proposte di nome** (disponibilità di dominio e marchio da verificare)

| Nome | Idea |
| --- | --- |
| Ognieuro | Il principio del metodo: ogni euro riceve una destinazione |
| Busta | Il budget a buste, immediato in italiano |
| Riparto | La ripartizione del giorno di paga |
| Pocketly | Neutro e internazionale, richiama i Pocket |

## Decisioni trasversali

Una sola codebase TypeScript, distribuita come un'immagine Docker più Postgres, valida per entrambe le edizioni: la differenza tra self-hosted e hosted è solo configurazione (`EDITION=self|cloud`).

| Area | Scelta | Motivo | Alternativa scartata |
| --- | --- | --- | --- |
| Frontend e API | Next.js (App Router) + TypeScript, Server Actions + route API REST | Una codebase, competenza esistente | SPA + backend separato: doppio deploy |
| UI | Tailwind + shadcn/ui, PWA installabile | Responsive telefono e desktop | App nativa: doppio codice |
| Database | Postgres 16 | Necessario per l'hosted multi-utente | SQLite: test doppi |
| ORM | Drizzle + migrazioni SQL versionate | Migrazioni leggibili e controllabili | Prisma: più pesante in container |
| Auth | Better Auth (email + password, passkey, TOTP) | Self-hostable, nessun servizio esterno | Auth0/Clerk: dipendenza a pagamento |
| Job | pg-boss su Postgres, worker nello stesso container | Niente Redis | BullMQ: un container in più |
| Importi | Interi in centesimi (`bigint`) + codice valuta ISO 4217 | Nessun errore di arrotondamento | `float`: errori sui totali |
| Multi-valuta | Valuta base per household; ogni conto ha la sua valuta; tassi giornalieri BCE | Fonte gratuita e ufficiale | API a pagamento |
| i18n | next-intl, italiano e inglese al lancio; formati numero e data per locale | Mercato UE | Solo italiano: refactoring dopo |
| Segreti bancari | Token cifrati a riposo (AES-256-GCM, chiave da variabile d'ambiente) | Token = accesso ai movimenti | In chiaro |
| Licenza | AGPL-3.0 | Protegge l'edizione hosted da copie SaaS | MIT: chiunque può rivendere l'hosted |
| Test | Vitest (logica), Playwright (flussi), test di migrazione su DB reale | Calcoli di denaro senza regressioni | Solo test manuali |

**Regola di dominio:** ogni importo ha una valuta. I totali si calcolano nella valuta base dell'household con il tasso del giorno del saldo, e il tasso usato viene salvato accanto allo snapshot, così lo storico non cambia se cambiano i tassi.

## Modello dati

Ogni tabella di dominio ha `household_id`: è la chiave di isolamento tra utenti nell'edizione hosted e costa nulla nel self-hosted. La colonna Fase indica quando la tabella entra in uso.

| Tabella | Campi principali | Fase |
| --- | --- | --- |
| `users` | id, email, nome, locale, created\_at | 1 |
| `households` | id, nome, valuta\_base, timezone | 1 |
| `household_members` | household\_id, user\_id, ruolo (owner, member, viewer), quota\_contribuzione | 1 |
| `institutions` | id, nome, paese, provider, provider\_ref (es. ASPSP Enable Banking) | 1 |
| `accounts` | id, household\_id, institution\_id, parent\_id (Pocket), nome, tipo, categoria, valuta, liquido, owner\_user\_id (null = comune), archiviato | 1 |
| `balance_snapshots` | account\_id, data, importo, valuta, fonte (manuale, csv, banca), tasso\_base | 1 |
| `income_events` | id, household\_id, data, importo, valuta, tipo (stipendio, fattura, altro), account\_id | 1 |
| `allocation_templates` | household\_id, nome, righe (voce, tipo, account destinazione, importo fisso o %, priorità, resto sì/no) | 1 |
| `allocations` | income\_event\_id, voce, tipo, account\_id, previsto, effettivo, fatto, transaction\_id | 1 |
| `goals` | household\_id, nome, target, valuta, scadenza, account collegati, stato | 1 |
| `contributions` | account\_id, data, importo, tipo (versamento, rimborso) | 1 |
| `net_worth_snapshots` | household\_id, data, totale, liquido, per\_categoria (jsonb) | 1 |
| `fx_rates` | data, valuta, tasso\_verso\_eur | 1 |
| `bank_connections` | household\_id, provider, session\_ref, token cifrato, consenso\_scadenza, stato, ultimo\_sync | 2 |
| `transactions` | account\_id, data\_contabile, importo, valuta, descrizione, controparte, provider\_ref (dedup), category\_id, transfer\_group\_id | 2 |
| `categories` | household\_id, nome, parent\_id, tipo (spesa, entrata, trasferimento) | 2 |
| `rules` | household\_id, condizione (testo, importo, controparte), azione (categoria, trasferimento), priorità | 2 |
| `instruments` · `holdings` · `prices` | ISIN, ticker · account\_id, quote, prezzo medio · ISIN, data, prezzo | 3 |
| `subscriptions` · `audit_log` | piano, stato, provider pagamento · chi, cosa, quando | 4 |

**Punti delicati**

- Un Pocket è un `account` con `parent_id`: i totali del conto padre escludono i figli per non contarli due volte.
- Il saldo "attuale" è l'ultimo `balance_snapshot` per conto; non si salva mai un saldo calcolato sopra un dato reale.
- `transfer_group_id` lega le due gambe di un giroconto (uscita BPER, entrata Revolut): escluse da spese ed entrate.

## Roadmap

&#91;embedded content: roadmap · 4 fasi, 3 gate\]

La fase 1 è l'unica con impegno certo; le altre partono solo se il gate precedente è superato.

## Fase 1 — MVP self-hosted

Obiettivo: sostituire il sistema Notion, senza banche collegate, in 4-6 settimane a 10+ ore settimanali. Esce quando il giorno di paga di un mese reale si chiude in meno di 10 minuti.

**Funzioni**

| # | Funzione | Dettaglio |
| --- | --- | --- |
| F1.1 | Installazione | `docker compose up`, migrazioni automatiche all'avvio, primo utente = owner; variabili d'ambiente documentate |
| F1.2 | Account e household | Registrazione, login, TOTP opzionale; invito di un secondo membro via link |
| F1.3 | Onboarding | Valuta base, lingua, creazione guidata di conti e Pocket con saldo iniziale |
| F1.4 | Conti e Pocket | CRUD, categorie (operativo, Pocket, fondo emergenza, capitale garantito, investimenti), liquido sì/no, personale o comune, valuta |
| F1.5 | Saldi | Aggiornamento rapido: una schermata con tutti i conti e un campo ciascuno; storico per conto |
| F1.6 | Modello di ripartizione | Righe con importo fisso o percentuale, conto destinazione, una riga "resto" che assorbe la differenza |
| F1.7 | Giorno di paga guidato | Wizard in 4 passi: entrata → ripartizione dal modello → checklist bonifici con Fatto → saldi aggiornati. "Da assegnare" sempre visibile, chiusura solo a 0 |
| F1.8 | Entrate irregolari | Stesso wizard su qualsiasi entrata; riga "accantonamento tasse" in % per freelance |
| F1.9 | Obiettivi | Target, scadenza, conti collegati; avanzamento %, quanto manca, quanto al mese |
| F1.10 | Versamenti | Registro di PAC e buoni; valore attuale inserito a mano accanto al capitale versato |
| F1.11 | Dashboard | Patrimonio totale e liquido, ciambella per categoria, budget dell'ultima entrata, obiettivi, andamento mensile |
| F1.12 | Snapshot automatico | Job mensile e alla chiusura di ogni giorno di paga che salva `net_worth_snapshots` |
| F1.13 | Multi-valuta | Tassi BCE giornalieri via job; totali in valuta base |
| F1.14 | Export e backup | Export CSV/JSON di tutti i dati; script di backup `pg_dump` documentato |
| F1.15 | Import da Notion | Import CSV delle tabelle esistenti (conti, mesi, ripartizione) per non ripartire da zero |

**Schermate**

1. Onboarding (3 passi)
2. Dashboard
3. Conti e Pocket (lista ad albero + dettaglio con storico)
4. Aggiorna saldi (tutti i conti in una pagina)
5. Giorno di paga (wizard)
6. Modelli di ripartizione
7. Obiettivi
8. Investimenti (versamenti + valore)
9. Impostazioni (household, membri, valuta, lingua, export)

**Criteri di accettazione**

- [ ] Da macchina pulita con Docker, l'app è in uso in meno di 5 minuti seguendo il README
- [ ] Il wizard non permette di chiudere con "Da assegnare" diverso da 0
- [ ] Un Pocket non viene mai contato due volte nei totali
- [ ] Un conto in valuta diversa entra nei totali con il tasso BCE del giorno, salvato nello snapshot
- [ ] Lo storico patrimonio si genera senza azioni manuali
- [ ] Utilizzabile da telefono a 375 px di larghezza, installabile come PWA
- [ ] Test automatici su calcoli di totali, ripartizione e cambi
- [ ] Ottobre e novembre 2026 gestiti nell'app al posto di Notion

## Fase 2 — Banche e movimenti

Obiettivo: saldi e movimenti dei conti di pagamento arrivano da soli, e le spese si categorizzano con poche correzioni. Durata stimata 4-6 settimane; è la fase più rischiosa.

**Architettura dei provider**

Ogni fonte implementa la stessa interfaccia `BankProvider`: `listInstitutions`, `startConsent`, `completeConsent`, `fetchAccounts`, `fetchBalances`, `fetchTransactions(since)`. Implementazioni: Manuale (fase 1), Import CSV, Enable Banking. Nel self-hosted l'utente inserisce la propria application ID e chiave privata Enable Banking nelle impostazioni.

**Funzioni**

| # | Funzione | Dettaglio |
| --- | --- | --- |
| F2.1 | Collegamento banca | Scelta della banca dal catalogo, redirect al login della banca, ritorno con consenso; mappatura dei conti trovati sui conti esistenti |
| F2.2 | Sync | Job ogni 6 ore e a richiesta; idempotente grazie a `provider_ref`; rispetto dei limiti di chiamate PSD2 (4 al giorno senza utente presente) |
| F2.3 | Rinnovo consenso | Avviso 14 giorni prima della scadenza (90-180 giorni a seconda della banca), rinnovo in un clic |
| F2.4 | Import CSV | Profili di import per banca (colonne, formato data, separatore decimale), anteprima e deduplica; utile per banche non coperte |
| F2.5 | Categorie | Albero predefinito in IT/EN, modificabile; categorie per spese, entrate, trasferimenti |
| F2.6 | Regole | "Se la descrizione contiene X / la controparte è Y / l'importo è Z → categoria"; creazione di una regola proposta dopo ogni correzione manuale |
| F2.7 | Giroconti | Abbinamento automatico di uscita e entrata con stesso importo entro 3 giorni tra conti propri; esclusi da spese ed entrate |
| F2.8 | Riconciliazione ripartizione | Le righe del giorno di paga si spuntano da sole quando arriva il bonifico corrispondente |
| F2.9 | Spese del mese | Vista per categoria con confronto sul mese precedente e sul budget |
| F2.10 | Coppie | Spese comuni e quote di contribuzione per membro; saldo "chi deve a chi" |

**Copertura prevista per il caso d'uso iniziale**

| Conto | Fonte |
| --- | --- |
| BPER | Enable Banking |
| Revolut saldo principale | Enable Banking; i Pocket probabilmente restano manuali |
| Trade Republic contanti | Enable Banking se coperto, altrimenti CSV |
| PAC ETF, Supersmart, buoni | Manuale (fase 1) |

**Criteri di accettazione**

- [ ] Un mese di movimenti BPER e Revolut importato senza duplicati dopo sync ripetuti
- [ ] Almeno l'80% dei movimenti del secondo mese categorizzato dalle regole senza intervento
- [ ] I giroconti tra conti propri non compaiono mai tra le spese
- [ ] Token bancari cifrati nel database; nessun token nei log
- [ ] Una banca con consenso scaduto mostra l'avviso e non blocca il resto dell'app

## Fase 3 — Uso reale e rilascio open source

Obiettivo: 2-3 mesi d'uso quotidiano, poi rilascio pubblico del self-hosted con i primi utenti esterni. In questa fase entrano i prezzi ETF automatici.

**Funzioni**

| # | Funzione | Dettaglio |
| --- | --- | --- |
| F3.1 | Prezzi ETF | Strumenti per ISIN, quote possedute, prezzo medio; prezzo di chiusura giornaliero da un feed sostituibile (interfaccia `PriceProvider`); valore = quote × prezzo |
| F3.2 | Rendimento | Capitale versato vs valore di mercato, rendimento semplice e annualizzato |
| F3.3 | Rilascio | Repository pubblico, immagine su GHCR con tag semantici, guida di installazione (Docker, Unraid, reverse proxy con HTTPS) |
| F3.4 | Aggiornamenti sicuri | Migrazioni testate in CI su un DB della versione precedente; note di rilascio |
| F3.5 | Telemetria opt-in | Solo conteggio anonimo di installazioni attive, disattivata di default |
| F3.6 | Documentazione | Sito docs con guida a Enable Banking, profili CSV delle banche italiane, FAQ |
| F3.7 | Demo | Istanza pubblica con dati fittizi, azzerata ogni notte |

**Segnali per decidere se passare alla fase 4**

| Segnale | Soglia indicativa |
| --- | --- |
| Utenti self-hosted attivi | Almeno 100 installazioni |
| Richieste esplicite di una versione gestita | Issue o messaggi ricorrenti |
| Stelle e contributi sul repository | Crescita costante per 3 mesi |

**Criteri di accettazione**

- [ ] Notion dismesso: tutti i dati personali vivono nell'app
- [ ] Un utente esterno installa e collega una banca seguendo solo la documentazione
- [ ] Il valore del PAC si aggiorna da solo ogni giorno lavorativo

## Fase 4 — Edizione hosted a pagamento

Obiettivo: offrire la versione gestita in abbonamento. Parte solo se i segnali della fase 3 ci sono, perché richiede prerequisiti legali e costi fissi prima del primo euro di ricavo.

**Prerequisiti non tecnici**

| Prerequisito | Perché |
| --- | --- |
| Soggetto che fattura (P.IVA o società) | Incassare abbonamenti |
| Contratto commerciale con Enable Banking (o altro AISP) | La modalità ristretta non copre conti di terzi; prezzi non pubblici, da negoziare |
| Privacy policy, termini di servizio, registro dei trattamenti, DPA con i fornitori | Dati finanziari di terzi sotto GDPR |
| Consulenza legale su PSD2 | Verificare che l'uso del provider licenziato basti senza licenza AISP propria |
| Hosting UE | Dati in Unione europea |

**Funzioni**

| # | Funzione | Dettaglio |
| --- | --- | --- |
| F4.1 | Multi-tenant | Isolamento per `household_id` con Row Level Security di Postgres come seconda barriera |
| F4.2 | Billing | Stripe Billing: prova gratuita, piano mensile e annuale, fatture, gestione IVA UE |
| F4.3 | Piani | Gratuito limitato (solo manuale) e Pro (banche collegate, coppie, ETF automatici) |
| F4.4 | Banche gestite | Chiavi del provider lato server, l'utente non vede nulla di tecnico |
| F4.5 | Sicurezza | 2FA obbligatoria per chi collega banche, audit log, backup cifrati giornalieri con restore testato |
| F4.6 | Diritti GDPR | Export ed eliminazione account self-service |
| F4.7 | Migrazione | Import di un export self-hosted nell'hosted e viceversa |
| F4.8 | Supporto e stato | Pagina di stato, email di supporto, monitoraggio errori |

**Criteri di accettazione**

- [ ] Test automatici che un household non legge mai i dati di un altro
- [ ] Ciclo completo: registrazione, prova, pagamento, disdetta, cancellazione dati
- [ ] Restore da backup provato su ambiente separato

## Rischi, domande aperte, fuori ambito

**Rischi**

| Rischio | Impatto | Mitigazione |
| --- | --- | --- |
| Categorizzazione scarsa | L'utente torna a fare a mano e abbandona | Regole create dalle correzioni; misurare la % automatica dal primo mese |
| Termini di Enable Banking non compatibili con il self-hosted per terzi | Il self-hosted perde il collegamento automatico | Verificare prima della fase 2; fallback CSV già previsto |
| Pocket Revolut non esposti via PSD2 | Parte del valore per il target principale resta manuale | Aggiornamento saldi rapido della fase 1 resta centrale |
| Mercato affollato | Pochi utenti, hosted non sostenibile | La fase 4 parte solo con segnali concreti |
| Tempo diviso tra più progetti | La fase 1 si allunga oltre 6 settimane | Ambito fase 1 congelato; nuove idee in backlog |
| Responsabilità su dati finanziari | Danno reputazionale e legale in caso di fuga di dati | Cifratura, 2FA, audit, nessun dato bancario nei log |

**Domande aperte**

- [ ] Nome definitivo e verifica di dominio e marchio
- [ ] I termini di Enable Banking ammettono che ogni utente self-hosted usi la propria chiave in modalità ristretta?
- [ ] Quali banche italiane espongono i saldi dei Pocket o dei sotto-conti
- [ ] Feed prezzi ETF: gratuito e affidabile per ISIN europei, con licenza compatibile
- [ ] Prezzo dell'abbonamento hosted

**Fuori ambito**

- Pagamenti e bonifici dall'app (PISP)
- App native iOS e Android
- Consulenza finanziaria o suggerimenti di investimento
- Dichiarazione dei redditi e calcolo fiscale preciso
