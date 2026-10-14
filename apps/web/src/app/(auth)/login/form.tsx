"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signInAction } from "@/app/actions/auth";
import { idleState } from "@/lib/action-state";
import { Button, Field, Input } from "@/components/ui";
import { PasskeyButton } from "@/components/passkey-button";

export function SignInForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(signInAction, idleState);

  return (
    <>
      <form action={action} className="mt-5 space-y-4">
        <Field label={t("email")} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
          />
        </Field>

        <Field label={t("password")} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {state.messageKey === "auth.tooManyAttempts" ? t("tooManyAttempts") : t("invalidCredentials")}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? tCommon("loading") : t("signIn")}
        </Button>
      </form>

      <PasskeyButton className="mt-3 w-full" />
    </>
  );
}
