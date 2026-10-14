"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createInviteAction } from "@/app/actions/misc";
import { idleState } from "@/lib/action-state";
import { Button, Field, Input, Select, type ButtonProps } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

type InviteState = ActionState & { token?: string };

/**
 * Invito di un membro (F1.2). Il link si mostra una volta sola: nel database
 * resta solo l'hash del token, quindi non si puo rileggere.
 */
export function InviteForm() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState<InviteState, FormData>(
    createInviteAction,
    idleState,
  );
  const [copied, setCopied] = useState(false);

  const link =
    state.token && typeof window !== "undefined"
      ? `${window.location.origin}/signup?invite=${state.token}`
      : null;

  return (
    <div className="rounded-card bg-surface-2 p-4">
      <h3 className="font-semibold text-ink">{t("invite")}</h3>

      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <Field label={t("email")} htmlFor="invite-email" className="min-w-48 flex-1">
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder={t("emailOptional")}
            className="bg-surface-1"
          />
        </Field>

        <Field label={t("role")} htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="member" className="bg-surface-1">
            <option value="member">{t("roles.member")}</option>
            <option value="viewer">{t("roles.viewer")}</option>
            <option value="owner">{t("roles.owner")}</option>
          </Select>
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : t("createInvite")}
        </Button>
      </form>

      {link ? (
        <div className="mt-3 rounded-xl bg-surface-1 p-3">
          <p className="text-xs font-semibold text-ink-secondary">{t("inviteLink")}</p>
          <p className="mt-1 break-all font-mono text-xs text-ink">{link}</p>
          <div className="mt-2 flex items-center gap-2">
            <CopyButton
              value={link}
              label={copied ? t("inviteCopied") : t("inviteCopy")}
              onCopied={() => setCopied(true)}
            />
            <span className="text-xs text-ink-muted">{t("inviteLinkHelp")}</span>
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-2 text-sm font-medium text-critical" role="alert">
          {tCommon("error")}
        </p>
      ) : null}
    </div>
  );
}

function CopyButton({
  value,
  label,
  onCopied,
  ...props
}: ButtonProps & { value: string; label: string; onCopied: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          onCopied();
        } catch {
          // Senza permesso per gli appunti resta la selezione manuale del testo.
        }
      }}
      {...props}
    >
      {label}
    </Button>
  );
}
