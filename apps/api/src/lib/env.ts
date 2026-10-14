/**
 * Variabili d'ambiente, validate una volta sola all'avvio.
 *
 * Un errore qui ferma il container subito, con un messaggio che dice cosa
 * manca: meglio di un fallimento a meta uso.
 */
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL mancante"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET deve essere lungo almeno 32 caratteri: usa `npm run setup`"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  /** Chiave AES-256-GCM in base64, 32 byte una volta decodificata. */
  ENCRYPTION_KEY: z
    .string()
    .refine((value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    }, "ENCRYPTION_KEY deve essere 32 byte in base64: usa `npm run setup`"),
  EDITION: z.enum(["self", "cloud"]).default("self"),
  DEFAULT_LOCALE: z.enum(["it", "en"]).default("it"),
  /** invite = solo primo utente e inviti; open = registrazione libera. */
  SIGNUP: z.enum(["invite", "open"]).default("invite"),
  TZ: z.string().default("Europe/Rome"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Disattiva i job pianificati (utile nei test e in CI). */
  DISABLE_JOBS: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configurazione non valida:\n${issues}\n\nVedi .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Vero nell'edizione self-hosted: abilita le impostazioni tecniche a schermo. */
export function isSelfHosted(): boolean {
  return env().EDITION === "self";
}
