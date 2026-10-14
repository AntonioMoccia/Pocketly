"use client";

import { Button } from "@/components/ui";

/**
 * Confine d'errore globale. Non mostra lo stack: su un'app di dati finanziari
 * un messaggio tecnico a schermo e un piccolo regalo a chi guarda.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-ink">Qualcosa non ha funzionato</h1>
      <p className="text-sm text-ink-secondary">
        L&apos;operazione non e andata a buon fine. Riprova tra poco.
      </p>
      <Button onClick={reset}>Riprova</Button>
    </main>
  );
}
