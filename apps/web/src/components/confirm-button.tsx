"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, cn } from "@/components/ui";

/**
 * Pulsante distruttivo in due tempi: il primo clic chiede conferma, il
 * secondo invia il form. Niente dialog del browser, la scelta resta sul posto.
 */
export function ConfirmButton({
  action,
  label,
  question,
  confirmLabel,
  cancelLabel,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  className?: string;
  /** Campi nascosti del form. */
  children?: React.ReactNode;
}) {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <form action={action} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {confirming ? (
        <>
          <span className="text-sm font-medium text-ink">{question}</span>
          <SubmitButton label={confirmLabel} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            {cancelLabel}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-critical"
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
      )}
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {label}
    </Button>
  );
}
