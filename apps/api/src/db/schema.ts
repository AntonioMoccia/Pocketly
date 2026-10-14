/**
 * Schema Postgres.
 *
 * Convenzioni:
 *  - gli importi sono interi di unita minori (centesimi) su colonne `bigint`,
 *    sempre accompagnati da un codice valuta ISO 4217;
 *  - ogni tabella di dominio porta `household_id`: e la chiave di isolamento
 *    tra utenti nell'edizione hosted e non costa nulla nel self-hosted;
 *  - le date di calendario sono `date` (stringa YYYY-MM-DD), i momenti nel
 *    tempo sono `timestamptz`;
 *  - le tabelle di autenticazione seguono i nomi di campo attesi da Better Auth.
 */
import {
  bigint,
  boolean,
  char,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
/** Importo in unita minori della valuta indicata nella stessa riga. */
const cents = (name: string) => bigint(name, { mode: "number" });

// ---------------------------------------------------------------------------
// Autenticazione (Better Auth)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  /** Lingua dell'interfaccia: "it" o "en". */
  locale: text().notNull().default("it"),
  twoFactorEnabled: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: text().primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean().notNull().default(true),
    /** Tentativi TOTP falliti di fila: oltre la soglia il secondo fattore si blocca. */
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [index("two_factors_user_idx").on(t.userId)],
);

export const passkeys = pgTable(
  "passkeys",
  {
    id: text().primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text().notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    aaguid: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Enum di dominio
// ---------------------------------------------------------------------------

export const memberRole = pgEnum("member_role", ["owner", "member", "viewer"]);

export const accountType = pgEnum("account_type", [
  "checking",
  "savings",
  "pocket",
  "investment",
  "cash",
  "other",
]);

/** Categorie della fase 1 (F1.4). */
export const accountCategory = pgEnum("account_category", [
  "operational",
  "pocket",
  "emergency_fund",
  "guaranteed_capital",
  "investments",
]);

export const balanceSource = pgEnum("balance_source", ["manual", "csv", "bank"]);
export const incomeKind = pgEnum("income_kind", ["salary", "invoice", "other"]);
export const allocationKind = pgEnum("allocation_kind", ["fixed", "percent", "remainder"]);
export const percentBasis = pgEnum("percent_basis", ["gross", "remaining"]);
export const goalStatus = pgEnum("goal_status", ["active", "reached", "paused", "archived"]);
export const contributionKind = pgEnum("contribution_kind", ["deposit", "withdrawal"]);

/**
 * Una busta reale corrisponde a un conto o a un Pocket: il disponibile e il
 * saldo vero. Una busta virtuale vive dentro un conto reale e il suo
 * disponibile si calcola (assegnato - speso + spostamenti).
 */
export const envelopeKind = pgEnum("envelope_kind", ["real", "virtual"]);

/** Che fine fa l'avanzo della busta a fine mese. */
export const leftoverPolicy = pgEnum("leftover_policy", ["accumulate", "sweep"]);

export const envelopeMoveReason = pgEnum("envelope_move_reason", [
  "overspend",
  "leftover",
  "manual",
]);

export const transferReason = pgEnum("transfer_reason", [
  "allocation",
  "overspend",
  "leftover",
  "wrong_account",
]);

export const transferStatus = pgEnum("transfer_status", ["todo", "done"]);

export const categoryKind = pgEnum("category_kind", ["expense", "income", "transfer"]);

export const transactionKind = pgEnum("transaction_kind", ["expense", "income", "transfer"]);

export const ruleField = pgEnum("rule_field", ["description", "counterparty", "amount"]);

export const ruleOperator = pgEnum("rule_operator", [
  "contains",
  "equals",
  "starts_with",
  "greater_than",
  "less_than",
]);

// ---------------------------------------------------------------------------
// Household e membri
// ---------------------------------------------------------------------------

export const households = pgTable("households", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  /** Valuta in cui si esprimono tutti i totali dell'household. */
  baseCurrency: char({ length: 3 }).notNull().default("EUR"),
  timezone: text().notNull().default("Europe/Rome"),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull().default("member"),
    /** Quota di contribuzione alle spese comuni, in punti base (10000 = 100%). */
    contributionShareBps: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("household_members_unique").on(t.householdId, t.userId),
    index("household_members_user_idx").on(t.userId),
  ],
);

export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Token del link di invito: hash, non il segreto in chiaro. */
    tokenHash: text().notNull().unique(),
    role: memberRole().notNull().default("member"),
    email: text(),
    invitedBy: text().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("household_invites_household_idx").on(t.householdId)],
);

// ---------------------------------------------------------------------------
// Istituti e conti
// ---------------------------------------------------------------------------

export const institutions = pgTable(
  "institutions",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** null = voce del catalogo globale, condivisa da tutti gli household. */
    householdId: uuid().references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    country: char({ length: 2 }),
    /** Fonte dei dati: "manual" in fase 1, poi "enablebanking", "csv". */
    provider: text().notNull().default("manual"),
    /** Riferimento tecnico presso il provider (es. ASPSP Enable Banking). */
    providerRef: text(),
    createdAt: createdAt(),
  },
  (t) => [index("institutions_household_idx").on(t.householdId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    institutionId: uuid().references(() => institutions.id, { onDelete: "set null" }),
    /**
     * Un Pocket e un conto con `parentId`. Un conto con Pocket non ha saldo
     * proprio: il suo totale e la somma dei Pocket.
     */
    parentId: uuid(),
    /**
     * Pocket di default del conto: tiene i soldi non messi da parte. Ogni conto
     * principale ne ha esattamente uno, creato insieme al conto.
     */
    isDefault: boolean().notNull().default(false),
    name: text().notNull(),
    type: accountType().notNull().default("checking"),
    category: accountCategory().notNull().default("operational"),
    currency: char({ length: 3 }).notNull().default("EUR"),
    /** Entra nel patrimonio liquido. */
    liquid: boolean().notNull().default(true),
    /** null = conto comune dell'household. */
    ownerUserId: text().references(() => users.id, { onDelete: "set null" }),
    archived: boolean().notNull().default(false),
    note: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "accounts_parent_fk",
    }).onDelete("set null"),
    index("accounts_household_idx").on(t.householdId),
    index("accounts_parent_idx").on(t.parentId),
    uniqueIndex("accounts_default_pocket_unique").on(t.parentId).where(sql`${t.isDefault}`),
  ],
);

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    amount: cents("amount").notNull(),
    currency: char({ length: 3 }).notNull(),
    source: balanceSource().notNull().default("manual"),
    /**
     * Tasso verso la valuta base dell'household al giorno del saldo.
     * Salvato qui perche lo storico non cambi se cambiano i tassi.
     */
    rateToBase: doublePrecision(),
    note: text(),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    // Un solo saldo per conto e per giorno: il secondo aggiornamento corregge.
    uniqueIndex("balance_snapshots_account_date_unique").on(t.accountId, t.date),
    index("balance_snapshots_household_date_idx").on(t.householdId, t.date),
  ],
);

// ---------------------------------------------------------------------------
// Entrate e ripartizione
// ---------------------------------------------------------------------------

export const allocationTemplates = pgTable(
  "allocation_templates",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("allocation_templates_household_idx").on(t.householdId)],
);

export const allocationTemplateLines = pgTable(
  "allocation_template_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    templateId: uuid()
      .notNull()
      .references(() => allocationTemplates.id, { onDelete: "cascade" }),
    label: text().notNull(),
    kind: allocationKind().notNull().default("fixed"),
    /** La riga punta a una busta; il conto si ricava dalla busta. */
    envelopeId: uuid(),
    amount: cents("amount").notNull().default(0),
    /** Punti base: 10000 = 100%. */
    percentBps: integer().notNull().default(0),
    percentBasis: percentBasis().notNull().default("gross"),
    priority: integer().notNull().default(0),
  },
  (t) => [index("allocation_template_lines_template_idx").on(t.templateId)],
);

export const incomeEvents = pgTable(
  "income_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    amount: cents("amount").notNull(),
    currency: char({ length: 3 }).notNull(),
    kind: incomeKind().notNull().default("salary"),
    /** Conto su cui arriva l'entrata. */
    accountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    templateId: uuid().references(() => allocationTemplates.id, { onDelete: "set null" }),
    note: text(),
    /** Valorizzato alla chiusura del giorno di paga. */
    closedAt: timestamp({ withTimezone: true }),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("income_events_household_date_idx").on(t.householdId, t.date)],
);

export const allocations = pgTable(
  "allocations",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    incomeEventId: uuid()
      .notNull()
      .references(() => incomeEvents.id, { onDelete: "cascade" }),
    label: text().notNull(),
    kind: allocationKind().notNull().default("fixed"),
    /** La riga punta a una busta; il conto si ricava dalla busta. */
    envelopeId: uuid(),
    /** Quanto il modello prevede per questa riga. */
    planned: cents("planned").notNull().default(0),
    /** Quanto e stato spostato davvero, se diverso dal previsto. */
    actual: cents("actual"),
    done: boolean().notNull().default(false),
    doneAt: timestamp({ withTimezone: true }),
    priority: integer().notNull().default(0),
    percentBps: integer().notNull().default(0),
    percentBasis: percentBasis().notNull().default("gross"),
    /** Movimento bancario che spunta la riga da solo (fase 2, F2.8). */
    transactionId: uuid(),
  },
  (t) => [
    index("allocations_income_idx").on(t.incomeEventId),
    index("allocations_household_idx").on(t.householdId),
  ],
);

// ---------------------------------------------------------------------------
// Obiettivi, versamenti, patrimonio
// ---------------------------------------------------------------------------

export const goals = pgTable(
  "goals",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    target: cents("target").notNull(),
    currency: char({ length: 3 }).notNull(),
    deadline: date({ mode: "string" }),
    status: goalStatus().notNull().default("active"),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index("goals_household_idx").on(t.householdId)],
);

export const goalAccounts = pgTable(
  "goal_accounts",
  {
    goalId: uuid()
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.goalId, t.accountId] })],
);

export const contributions = pgTable(
  "contributions",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    amount: cents("amount").notNull(),
    currency: char({ length: 3 }).notNull(),
    kind: contributionKind().notNull().default("deposit"),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("contributions_account_date_idx").on(t.accountId, t.date),
    index("contributions_household_idx").on(t.householdId),
  ],
);

export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    total: cents("total").notNull(),
    liquid: cents("liquid").notNull(),
    currency: char({ length: 3 }).notNull(),
    byCategory: jsonb().$type<Record<string, number>>().notNull().default({}),
    /** Tassi usati per questo snapshot, per rendere il totale riproducibile. */
    rates: jsonb().$type<Record<string, number>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("net_worth_snapshots_unique").on(t.householdId, t.date)],
);

export const fxRates = pgTable(
  "fx_rates",
  {
    date: date({ mode: "string" }).notNull(),
    currency: char({ length: 3 }).notNull(),
    /**
     * Unita di valuta per 1 EUR, come pubblica la BCE (1 EUR = 1,0850 USD).
     * EUR non viene salvato: vale 1 per definizione.
     */
    unitsPerEur: doublePrecision().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
);

// ---------------------------------------------------------------------------
// Buste: l'unita del budget
// ---------------------------------------------------------------------------

/**
 * Una busta risponde a "con quali soldi?". La categoria risponde a "cosa ho
 * comprato?": sono due assi indipendenti sulla stessa spesa.
 *
 * Una busta reale e un conto o un Pocket, e il disponibile e il saldo vero.
 * Una busta virtuale vive dentro un conto reale, e il disponibile si calcola.
 */
export const envelopes = pgTable(
  "envelopes",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: envelopeKind().notNull().default("virtual"),
    /** Conto che tiene i soldi: il Pocket stesso se reale, il conto che la contiene se virtuale. */
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    leftoverPolicy: leftoverPolicy().notNull().default("accumulate"),
    /** Dove finisce l'avanzo con politica "svuota". */
    sweepToEnvelopeId: uuid(),
    /** Indice del colore nella palette delle buste. */
    color: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.sweepToEnvelopeId],
      foreignColumns: [t.id],
      name: "envelopes_sweep_fk",
    }).onDelete("set null"),
    index("envelopes_household_idx").on(t.householdId),
    index("envelopes_account_idx").on(t.accountId),
  ],
);

/**
 * Spostamento di assegnato tra buste: copertura di uno sforamento, avanzo di
 * fine mese o scelta manuale.
 */
export const envelopeMoves = pgTable(
  "envelope_moves",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    fromEnvelopeId: uuid().references(() => envelopes.id, { onDelete: "set null" }),
    toEnvelopeId: uuid().references(() => envelopes.id, { onDelete: "set null" }),
    amount: cents("amount").notNull(),
    currency: char({ length: 3 }).notNull(),
    date: date({ mode: "string" }).notNull(),
    reason: envelopeMoveReason().notNull().default("manual"),
    /** Giroconto generato, quando le due buste stanno su conti diversi. */
    transferTodoId: uuid(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("envelope_moves_household_date_idx").on(t.householdId, t.date),
    index("envelope_moves_from_idx").on(t.fromEnvelopeId),
    index("envelope_moves_to_idx").on(t.toEnvelopeId),
  ],
);

/**
 * Giroconto da fare: le buste virtuali si spostano con un clic, i soldi reali
 * no. Ogni volta che le due cose divergono nasce una riga qui, altrimenti i
 * saldi mentirebbero.
 */
export const transferTodos = pgTable(
  "transfer_todos",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    fromAccountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    amount: cents("amount").notNull(),
    currency: char({ length: 3 }).notNull(),
    reason: transferReason().notNull().default("allocation"),
    status: transferStatus().notNull().default("todo"),
    /** Movimento che ha spuntato il giroconto da solo. */
    transactionId: uuid(),
    /** Entrata che lo ha generato, per i bonifici del giorno di paga. */
    incomeEventId: uuid().references(() => incomeEvents.id, { onDelete: "cascade" }),
    note: text(),
    createdAt: createdAt(),
    doneAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("transfer_todos_household_status_idx").on(t.householdId, t.status)],
);

// ---------------------------------------------------------------------------
// Movimenti, categorie e regole (fase 1.5)
// ---------------------------------------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    parentId: uuid(),
    kind: categoryKind().notNull().default("expense"),
    /** Busta su cui scalare le spese di questa categoria. */
    defaultEnvelopeId: uuid().references(() => envelopes.id, { onDelete: "set null" }),
    color: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: "categories_parent_fk",
    }).onDelete("set null"),
    index("categories_household_idx").on(t.householdId),
  ],
);

export const importProfiles = pgTable(
  "import_profiles",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    institutionId: uuid().references(() => institutions.id, { onDelete: "set null" }),
    /** Campo Pocketly -> intestazione nel file. */
    columnMap: jsonb().$type<Record<string, string>>().notNull().default({}),
    dateFormat: text().notNull().default("auto"),
    decimalSeparator: text().notNull().default(","),
    delimiter: text().notNull().default(","),
    encoding: text().notNull().default("utf-8"),
    /** Come si legge il segno: una colonna con segno, o due colonne dare/avere. */
    amountMode: text().notNull().default("signed"),
    createdAt: createdAt(),
  },
  (t) => [index("import_profiles_household_idx").on(t.householdId)],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    profileId: uuid().references(() => importProfiles.id, { onDelete: "set null" }),
    filename: text().notNull(),
    rowCount: integer().notNull().default(0),
    importedCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("import_batches_household_idx").on(t.householdId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    bookedDate: date({ mode: "string" }).notNull(),
    amount: cents("amount").notNull(),
    currency: char({ length: 3 }).notNull(),
    description: text().notNull(),
    counterparty: text(),
    /**
     * Impronta della riga di origine: lo stesso estratto conto importato due
     * volte non crea doppioni.
     */
    providerRef: text().notNull(),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    /** Busta da cui la spesa e scalata. */
    envelopeId: uuid().references(() => envelopes.id, { onDelete: "set null" }),
    /** Lega le due gambe di un giroconto: escluse da spese ed entrate. */
    transferGroupId: uuid(),
    kind: transactionKind().notNull().default("expense"),
    /** Fuori da ogni conteggio, per scelta dell'utente. */
    ignored: boolean().notNull().default(false),
    importBatchId: uuid().references(() => importBatches.id, { onDelete: "set null" }),
    incomeEventId: uuid().references(() => incomeEvents.id, { onDelete: "set null" }),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("transactions_dedup_unique").on(t.accountId, t.providerRef),
    index("transactions_household_date_idx").on(t.householdId, t.bookedDate),
    index("transactions_envelope_idx").on(t.envelopeId),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_transfer_group_idx").on(t.transferGroupId),
  ],
);

export const rules = pgTable(
  "rules",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    field: ruleField().notNull().default("description"),
    operator: ruleOperator().notNull().default("contains"),
    value: text().notNull(),
    categoryId: uuid().references(() => categories.id, { onDelete: "cascade" }),
    envelopeId: uuid().references(() => envelopes.id, { onDelete: "set null" }),
    priority: integer().notNull().default(0),
    enabled: boolean().notNull().default(true),
    /** Quante volte ha gia categorizzato qualcosa: misura l'utilita della regola. */
    hitCount: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("rules_household_priority_idx").on(t.householdId, t.priority)],
);

/**
 * Chiusura di un mese: applica le politiche avanzi una volta sola e tiene
 * traccia di cosa e gia stato fatto.
 */
export const monthCloses = pgTable(
  "month_closes",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Primo giorno del mese chiuso. */
    month: date({ mode: "string" }).notNull(),
    closedAt: createdAt(),
    closedBy: text().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("month_closes_unique").on(t.householdId, t.month)],
);

export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type IncomeEvent = typeof incomeEvents.$inferSelect;
export type Allocation = typeof allocations.$inferSelect;
export type AllocationTemplate = typeof allocationTemplates.$inferSelect;
export type AllocationTemplateLine = typeof allocationTemplateLines.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type Institution = typeof institutions.$inferSelect;
export type Envelope = typeof envelopes.$inferSelect;
export type EnvelopeMove = typeof envelopeMoves.$inferSelect;
export type TransferTodo = typeof transferTodos.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type ImportProfile = typeof importProfiles.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
