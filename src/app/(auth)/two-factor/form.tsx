"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { verifyTotpAction } from "@/app/actions/auth";
import { idleState } from "@/lib/action-state";
import { Button, Field, Input } from "@/components/ui";

export function TwoFactorForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(verifyTotpAction, idleState);

  return (
    <form action={action} className="mt-5 space-y-4">
      <Field label={t("twoFactorCode")} htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="tabular text-center text-lg tracking-[0.3em]"
        />
      </Field>

      {state.status === "error" ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {t("twoFactorInvalid")}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? tCommon("loading") : tCommon("confirm")}
      </Button>
    </form>
  );
}
