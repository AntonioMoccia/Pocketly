"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui";

/**
 * Accesso con passkey. Il pulsante compare solo dove il browser supporta
 * WebAuthn: offrirlo altrove sarebbe un vicolo cieco.
 */
export function PasskeyButton({ className }: { className?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  if (!supported) return null;

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={className}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try {
            const result = await authClient.signIn.passkey();
            if (result?.error) setFailed(true);
            else router.push("/");
          } catch {
            setFailed(true);
          } finally {
            setPending(false);
          }
        }}
      >
        {t("passkeySignIn")}
      </Button>
      {failed ? (
        <p className="mt-2 text-center text-xs text-critical" role="alert">
          {t("passkeyFailed")}
        </p>
      ) : null}
    </>
  );
}

/** Registrazione di una nuova passkey, dalle impostazioni. */
export function AddPasskeyButton() {
  const t = useTranslations("auth");
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");

  return (
    <div>
      <Button
        variant="outline"
        disabled={state === "pending"}
        onClick={async () => {
          setState("pending");
          try {
            const result = await authClient.passkey.addPasskey();
            setState(result?.error ? "error" : "done");
          } catch {
            setState("error");
          }
        }}
      >
        {t("passkeyAdd")}
      </Button>
      {state === "done" ? (
        <p className="mt-2 text-sm text-good" role="status">
          {t("passkeyAdded")}
        </p>
      ) : null}
      {state === "error" ? (
        <p className="mt-2 text-sm text-critical" role="alert">
          {t("passkeyFailed")}
        </p>
      ) : null}
    </div>
  );
}
