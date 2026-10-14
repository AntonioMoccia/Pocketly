"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signUpAction } from "@/app/actions/auth";
import { idleState } from "@/lib/action-state";
import { Button, Field, Input } from "@/components/ui";

export function SignUpForm({ invite }: { invite?: string }) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(signUpAction, idleState);

  return (
    <form action={action} className="mt-5 space-y-4">
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}

      <Field label={t("name")} htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" autoComplete="name" required autoFocus maxLength={80} />
      </Field>

      <Field label={t("email")} htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>

      <Field
        label={t("password")}
        htmlFor="password"
        hint={t("passwordHint")}
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      {state.status === "error" && !state.fieldErrors ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {state.messageKey === "auth.emailInUse"
            ? t("emailInUse")
            : state.messageKey === "auth.signUpClosed"
              ? t("signUpClosed")
              : tCommon("error")}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? tCommon("loading") : t("signUp")}
      </Button>
    </form>
  );
}
