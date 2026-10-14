# Pocketly

Budget multi-conto: a ogni entrata, ogni euro riceve una destinazione.

Pocketly distribuisce le entrate su più banche e Pocket, tiene aggiornati
patrimonio e obiettivi, e — quando arrivano i movimenti — confronta il piano
con la realtà. Gira a casa tua, con Docker, sui tuoi dati.

- **Vista unica su più istituti**, non una app per banca.
- **Giorno di paga guidato**: entrata → ripartizione → bonifici → saldi.
- **Buste (envelopes)**: la categoria dice *cosa* hai comprato, la busta *con
  quali soldi*.
- **Self-hosted**, licenza AGPL-3.0.

---

## Avvio rapido

Servono [Docker](https://docs.docker.com/get-docker/) e cinque minuti.

```bash
git clone <questo-repository> pocketly
cd pocketly

# Genera .env con password e chiavi casuali
node scripts/init-env.mjs

docker compose up -d
```

Apri <http://localhost:3000>. **Il primo account che registri diventa l'owner**
dell'istanza; da quel momento le registrazioni si aprono solo con un link di
invito (`SIGNUP=invite`, impostazione predefinita).

L'onboarding in tre passi chiede household e valuta base, i conti con il saldo
di oggi, e come dividere l'entrata. Da lì sei operativo.

### Aggiornare

```bash
git pull
docker compose up -d --build
```

Le migrazioni si applicano da sole all'avvio del container, prima che l'app
inizi a servire richieste.

---

## Configurazione

Tutte le variabili stanno in `.env` (vedi `.env.example`).

| Variabile | Serve a | Predefinito |
| --- | --- | --- |
| `DATABASE_URL` | Connessione a Postgres | costruita dal compose |
| `BETTER_AUTH_SECRET` | Firma dei cookie di sessione (32+ caratteri) | generata da `init-env.mjs` |
| `ENCRYPTION_KEY` | Cifratura dei segreti a riposo, AES-256-GCM (32 byte in base64) | generata da `init-env.mjs` |
| `BETTER_AUTH_URL` | URL pubblico da cui raggiungi l'app | `http://localhost:3000` |
| `SIGNUP` | `invite` (solo primo utente e inviti) o `open` | `invite` |
| `DEFAULT_LOCALE` | `it` o `en` | `it` |
| `APP_PORT` | Porta esposta sull'host | `3000` |
| `TZ` | Fuso dei job pianificati | `Europe/Rome` |
| `DISABLE_JOBS` | `true` spegne i job pianificati | non impostata |

> `BETTER_AUTH_URL` deve combaciare con l'indirizzo che usi nel browser,
> altrimenti i cookie di sessione non vengono accettati.

### Dietro un reverse proxy con HTTPS

Imposta `BETTER_AUTH_URL=https://pocketly.tuodominio.it` e inoltra al
container sulla porta 3000. Con HTTPS i cookie passano automaticamente in
modalità `Secure`. Esempio minimo per Caddy:

```
pocketly.tuodominio.it {
    reverse_proxy localhost:3000
}
```

---

## Accesso da app e script

Oltre al sito, l'API accetta client esterni (un'app mobile, uno script, un
foglio di calcolo) sulla porta `API_PORT` (4000 di default). Il login
restituisce un token di sessione, da mandare a ogni chiamata:

```bash
curl -s http://localhost:4000/api/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"email":"tu@esempio.it","password":"..."}'
# {"token":"...","user":{...}}

curl -s http://localhost:4000/api/v1/accounts -H "Authorization: Bearer $TOKEN"
```

Con il secondo fattore attivo il login risponde `{"twoFactorRequired":true,
"challenge":"..."}`: si completa con `POST /api/v1/auth/token/two-factor` e
`{"challenge":"...","code":"123456"}` (oppure `"backupCode"`). Il logout è
`DELETE /api/v1/auth/token`.

Ogni token è una sessione come quelle del browser: compare in
**Impostazioni → Dispositivi collegati** e da lì si disconnette. I tentativi di
login sono limitati per indirizzo IP. Se esponi l'API su internet mettila
dietro HTTPS, come il sito.

## Backup e ripristino

I dati stanno tutti in Postgres. Il backup è un `pg_dump`:

```bash
# Backup (il file finisce nella cartella corrente)
docker compose exec -T db pg_dump -U pocketly pocketly | gzip > pocketly-$(date +%F).sql.gz

# Ripristino su un database vuoto
gunzip -c pocketly-2026-10-14.sql.gz | docker compose exec -T db psql -U pocketly pocketly
```

Conserva anche `.env`: senza `ENCRYPTION_KEY` i dati cifrati non si
recuperano, e senza `BETTER_AUTH_SECRET` tutte le sessioni decadono.

Per un backup che puoi leggere anche senza Postgres, da **Impostazioni → Dati**
scarichi l'export JSON o CSV di tutto l'household.

---

## Come funziona

### Conti, Pocket e buste

Un **Pocket** è un conto dentro un conto. Ogni conto nasce con un Pocket
"Principale" che tiene i soldi non messi da parte: i saldi si registrano sui
Pocket e il totale del conto è la loro somma, così niente si conta due volte.

Una **busta** risponde a "con quali soldi?".

- **Reale**: corrisponde a un conto o a un Pocket, e il disponibile è il saldo
  vero.
- **Virtuale**: vive dentro un conto reale, e il disponibile si calcola come
  riporto + assegnato + ricevuti − ceduti − speso.

Le buste virtuali si spostano con un clic, i soldi reali no: ogni volta che le
due cose divergono, Pocketly genera un **giroconto da fare**, che si spunta da
solo quando lo ritrova nel prossimo import.

### Denaro e valute

Gli importi sono interi di centesimi su colonne `bigint`, mai float. Ogni
importo porta con sé la valuta. I totali si calcolano nella valuta base
dell'household con il tasso del giorno del saldo, e **il tasso usato viene
salvato accanto allo snapshot**: lo storico non cambia se domani cambiano i
cambi. I tassi arrivano dal feed pubblico della BCE, una volta al giorno.

---

## Sviluppo

```bash
npm install
node scripts/init-env.mjs
docker compose up -d db        # solo il database
npm run db:migrate
npm run dev                    # API su :4000, frontend su http://localhost:3000
```

Serve Node 22 o successivo.

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | API e frontend in sviluppo, insieme |
| `npm run build` | Build di produzione di API e frontend |
| `npm run start:api` / `npm run start:web` | Servono le build di produzione |
| `npm test` | Test unitari (Vitest) |
| `npm run test:e2e` | Test end-to-end (Playwright) |
| `npm run typecheck` | Controllo dei tipi |
| `npm run db:generate` | Genera una migrazione dallo schema |
| `npm run db:migrate` | Applica le migrazioni |

### Test

I test unitari coprono la parte che non può sbagliare: aritmetica del denaro,
cambi, motore di ripartizione, buste, regole di categorizzazione e lettura dei
CSV. I test end-to-end girano contro l'app vera e un database vero, e
verificano i criteri di accettazione misurabili:

- un Pocket non viene contato due volte nel patrimonio;
- il giorno di paga non si chiude finché resta qualcosa da assegnare;
- lo storico del patrimonio si genera senza azioni manuali;
- lo stesso estratto conto importato due volte non crea doppioni;
- nessuna pagina scorre in orizzontale a 375 px.

```bash
npm run build        # i test girano contro la build di produzione
npm run test:e2e     # crea e azzera da solo un database separato
```

I test end-to-end usano `E2E_DATABASE_URL` (vedi `.env.example`) e non
toccano mai i dati di sviluppo.

---

## Struttura

```
packages/domain/      Dominio puro e testabile: denaro, cambi, ripartizione,
                      buste, regole, CSV, date
apps/api/             API REST (NestJS), l'unica che parla col database
├── src/modules/      Controller per area: conti, buste, movimenti, paga...
├── src/data/         Accesso ai dati, sempre filtrato per household
├── src/db/           Schema Drizzle e migrazioni SQL versionate
├── src/auth/         Better Auth: password, TOTP, passkey
└── src/jobs/         Job pianificati (tassi, snapshot, giroconti)
apps/web/             Frontend (Next.js)
├── src/app/          Pagine (App Router) e Server Action
├── src/data/         Letture dall'API
├── src/components/   Interfaccia: primitive, grafici, navigazione
└── src/messages/     Traduzioni italiano e inglese
```

La regola che tiene in piedi l'architettura: il dominio non conosce il
database, l'API non conosce React, il frontend non conosce SQL, e ogni query
porta con sé il suo `householdId`, che arriva dalla sessione e mai dal client.
Dettagli in [`docs/architettura.md`](docs/architettura.md).

---

## Licenza

[AGPL-3.0](LICENSE). Puoi usarlo, modificarlo e ridistribuirlo; se lo offri
come servizio a terzi, devi pubblicare le tue modifiche.
