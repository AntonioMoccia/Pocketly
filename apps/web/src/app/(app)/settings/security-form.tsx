"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction, enableTotpAction } from "@/app/actions/auth";
import { idleState, type ActionState } from "@/lib/action-state";
import { Button, Field, Input } from "@/components/ui";
import { AddPasskeyButton } from "@/components/passkey-button";

type TotpState = ActionState & { totpUri?: string; backupCodes?: string[] };

/**
 * Password e secondo fattore. Il QR si costruisce da un URI `otpauth://`:
 * si mostra come link, senza caricare una libreria di QR, e l'utente puo
 * anche incollare il segreto a mano nell'app di autenticazione.
 */
export function SecurityForm() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePasswordAction,
    idleState,
  );
  const [totpState, totpAction, totpPending] = useActionState<TotpState, FormData>(
    enableTotpAction,
    idleState,
  );
  const [showTotp, setShowTotp] = useState(false);

  const secret = totpState.totpUri
    ? new URL(totpState.totpUri.replace("otpauth://", "https://")).searchParams.get("secret")
    : null;

  return (
    <div className="space-y-6">
      <form action={passwordAction} className="space-y-3">
        <h3 className="font-semibold text-ink">{t("changePassword")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("currentPassword")} htmlFor="current-password">
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label={t("newPassword")} htmlFor="new-password" hint={tAuth("passwordHint")}>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
          </Field>
        </div>

        {passwordState.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {tAuth("invalidCredentials")}
          </p>
        ) : null}
        {passwordState.status === "success" ? (
          <p className="text-sm font-medium text-good" role="status">
            {t("passwordChanged")}
          </p>
        ) : null}

        <Button type="submit" disabled={passwordPending}>
          {passwordPending ? tCommon("saving") : tCommon("save")}
        </Button>
      </form>

      <div className="border-t border-border pt-5">
        <h3 className="font-semibold text-ink">{tAuth("passkeys")}</h3>
        <p className="mt-1 text-sm text-ink-secondary">{tAuth("passkeysDesc")}</p>
        <div className="mt-3">
          <AddPasskeyButton />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="font-semibold text-ink">{tAuth("twoFactorEnable")}</h3>
        <p className="mt-1 text-sm text-ink-secondary">{tAuth("twoFactorScan")}</p>

        {!showTotp ? (
          <Button variant="outline" className="mt-3" onClick={() => setShowTotp(true)}>
            {tAuth("twoFactorEnable")}
          </Button>
        ) : (
          <form action={totpAction} className="mt-3 space-y-3">
            <Field label={tAuth("password")} htmlFor="totp-password">
              <Input
                id="totp-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="max-w-xs"
              />
            </Field>

            {totpState.status === "error" ? (
              <p className="text-sm font-medium text-critical" role="alert">
                {tAuth("invalidCredentials")}
              </p>
            ) : null}

            <Button type="submit" disabled={totpPending}>
              {totpPending ? tCommon("saving") : tCommon("confirm")}
            </Button>
          </form>
        )}

        {totpState.totpUri ? (
          <div className="mt-4 rounded-card bg-surface-2 p-4">
            <p className="text-sm font-semibold text-ink">{tAuth("twoFactorSecret")}</p>
            <p className="mt-1 break-all font-mono text-sm text-ink">{secret}</p>
            <a
              href={totpState.totpUri}
              className="mt-2 inline-block text-sm font-semibold text-accent hover:underline"
            >
              {tAuth("twoFactorOpenApp")}
            </a>

            {totpState.backupCodes && totpState.backupCodes.length > 0 ? (
              <>
                <p className="mt-4 text-sm font-semibold text-ink">
                  {tAuth("twoFactorBackupCodes")}
                </p>
                <ul className="mt-1 grid grid-cols-2 gap-1 font-mono text-sm text-ink">
                  {totpState.backupCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
