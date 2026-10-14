/**
 * Dispositivi collegati: le sessioni aperte dell'utente, dal sito o da app e
 * script che usano un token.
 */
import { api } from "@/lib/api";
import type { SessionInfo } from "@api/modules/auth/session-info";

export type { SessionInfo };

export function listSessions() {
  return api.get<SessionInfo[]>("/me/sessions");
}

/**
 * Nome leggibile del client a partire dallo user agent: abbastanza per
 * riconoscere "il telefono" o "lo script", senza una libreria apposta.
 */
export function describeClient(userAgent: string | null): string {
  if (!userAgent) return "—";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  if (browser) return os ? `${browser} · ${os}` : browser;
  // Un client che non e un browser (app, curl, script): il primo pezzo dello
  // user agent di solito ne dice nome e versione.
  return userAgent.split(" ")[0]?.slice(0, 60) ?? userAgent.slice(0, 60);
}
