"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startPaydayAction } from "@/app/actions/payday";
import { idleState } from "@/lib/action-state";
import { AmountInput, Button, Card, Field, Input, Select } from "@/components/ui";

/** Passo 1 del wizard: quanto e arrivato, quando, e con quale modello dividerlo. */
export function StartPaydayForm({
  today,
  baseCurrency,
  templates,
  accounts,
}: {
  today: string;
  baseCurrency: string;
  templates: { id: string; name: string; isDefault: boolean; lineCount: number }[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  const t = useTranslations("payday");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(startPaydayAction, idleState);

  const defaultTemplate = templates.find((template) => template.isDefault);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold text-ink">{t("step1")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("step1Desc")}</p>

      <form action={action} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("incomeAmount")}
            htmlFor="payday-amount"
            error={state.fieldErrors?.amount ? t("invalidAmount") : undefined}
          >
            <AmountInput
              id="payday-amount"
              name="amount"
              required
              placeholder="0,00"
              aria-invalid={Boolean(state.fieldErrors?.amount)}
            />
          </Field>

          <Field label={t("incomeDate")} htmlFor="payday-date">
            <Input id="payday-date" name="date" type="date" defaultValue={today} required />
          </Field>
        </div>

        <input type="hidden" name="currency" value={baseCurrency} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("incomeKind")} htmlFor="payday-kind">
            <Select id="payday-kind" name="kind" defaultValue="salary">
              <option value="salary">{t("kinds.salary")}</option>
              <option value="invoice">{t("kinds.invoice")}</option>
              <option value="other">{t("kinds.other")}</option>
            </Select>
          </Field>

          <Field label={t("incomeAccount")} htmlFor="payday-account">
            <Select id="payday-account" name="accountId" defaultValue="">
              <option value="">{tCommon("none")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label={t("template")}
          htmlFor="payday-template"
          hint={defaultTemplate ? t("templateDefaultHint", { name: defaultTemplate.name }) : undefined}
        >
          <Select id="payday-template" name="templateId" defaultValue={defaultTemplate?.id ?? ""}>
            <option value="">{t("templateNone")}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.lineCount})
              </option>
            ))}
          </Select>
        </Field>

        {state.status === "error" && !state.fieldErrors ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {t("startFailed")}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? tCommon("saving") : t("start")}
        </Button>
      </form>
    </Card>
  );
}
