"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateHouseholdAction } from "@/app/actions/misc";
import { idleState } from "@/lib/action-state";
import { Button, Field, Input } from "@/components/ui";

export function HouseholdForm({
  household,
}: {
  household: { name: string; baseCurrency: string; timezone: string };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(updateHouseholdAction, idleState);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tCommon("name")} htmlFor="household-name">
          <Input id="household-name" name="name" required defaultValue={household.name} maxLength={80} />
        </Field>

        <Field
          label={t("baseCurrency")}
          htmlFor="household-currency"
          hint={t("baseCurrencyHelp")}
        >
          <Input
            id="household-currency"
            name="baseCurrency"
            required
            minLength={3}
            maxLength={3}
            defaultValue={household.baseCurrency}
            className="uppercase"
          />
        </Field>

        <Field label={t("timezone")} htmlFor="household-timezone">
          <Input
            id="household-timezone"
            name="timezone"
            required
            defaultValue={household.timezone}
          />
        </Field>
      </div>

      {state.status === "error" ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {tCommon("error")}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm font-medium text-good" role="status">
          {tCommon("saved")}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? tCommon("saving") : tCommon("save")}
      </Button>
    </form>
  );
}
