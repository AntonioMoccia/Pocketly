/**
 * Cifratura dei segreti a riposo (AES-256-GCM con chiave da variabile
 * d'ambiente), piu l'hashing dei token di invito.
 *
 * In fase 1 serve agli inviti; in fase 2 cifrera i token bancari, che valgono
 * accesso ai movimenti. Il formato e `v1.<iv>.<tag>.<ciphertext>` in base64url,
 * con il prefisso di versione per poter cambiare algoritmo senza ambiguita.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function key(): Buffer {
  return Buffer.from(env().ENCRYPTION_KEY, "base64");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Formato del segreto cifrato non riconosciuto");
  }
  const [, iv, tag, ciphertext] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key(), unb64(iv));
  decipher.setAuthTag(unb64(tag));
  return Buffer.concat([decipher.update(unb64(ciphertext)), decipher.final()]).toString("utf8");
}

function b64(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function unb64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/** Token di invito: si mostra una volta, nel database resta solo l'hash. */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
