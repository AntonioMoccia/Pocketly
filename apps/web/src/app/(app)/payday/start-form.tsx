"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { startPaydayAction } from "@/app/actions/payday";
import { idleState } from "@/lib/action-state";
import { AmountInput, Button, Card, Field, Input, Select } from "@/components/ui";
import { GroupedPicker } from "@/components/grouped-picker";
import { INCOME_KINDS, type IncomeKind } from "@pocketly/domain/income";

type Template = {
  id: string;
  name: string;
  isDefault: boolean;
  incomeKind: IncomeKind | null;
  lineCount: number;
};

/** Valori di partenza: da un movimento importato o dal saldo di un Pocket. */
export type StartPrefill = {
  amount: string;
  date: string;
  accountId: string | null;
  kind: IncomeKind;
  note: string;
  transactionId: string | null;
};

/**
 * Passo 1: quanto e arrivato, quando, e con quale modello dividerlo. Il
 * modello segue il tipo di entrata finche l'utente non lo sceglie a mano.
 */
export function StartPaydayForm({
  today,
  baseCurrency,
  templates,
  accounts,
  prefill,
}: {
  today: string;
  baseCurrency: string;
  templates: Template[];
  accounts: { id: string; name: string; mainAccountName: string }[];
  prefill?: StartPrefill;
}) {
  const t = useTranslations("payday");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(startPaydayAction, idleState);

  const templateFor = (kind: IncomeKind) =>
    templates.find((template) => template.incomeKind === kind) ??
    templates.find((template) => template.isDefault) ??
    null;

  const [kind, setKind] = useState<IncomeKind>(prefill?.kind ?? "salary");
  const [templateId, setTemplateId] = useState(
    templateFor(prefill?.kind ?? "salary")?.id ?? "none",
  );
  const [touchedTemplate, setTouchedTemplate] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(prefill?.accountId ?? null);

  const suggested = templateFor(kind);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold text-ink">{t("step1")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("step1Desc")}</p>

      <form action={action} className="mt-4 space-y-4">
        {prefill?.transactionId ? (
          <input type="hidden" name="transactionId" value={prefill.transactionId} />
        ) : null}
        {prefill?.note ? <input type="hidden" name="note" value={prefill.note} /> : null}

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
              defaultValue={prefill?.amount}
              aria-invalid={Boolean(state.fieldErrors?.amount)}
            />
          </Field>

          <Field label={t("incomeDate")} htmlFor="payday-date">
            <Input
              id="payday-date"
              name="date"
              type="date"
              defaultValue={prefill?.date ?? today}
              required
            />
          </Field>
        </div>

        <input type="hidden" name="currency" value={baseCurrency} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("incomeKind")} htmlFor="payday-kind">
            <Select
              id="payday-kind"
              name="kind"
              value={kind}
              onChange={(event) => {
                const next = event.target.value as IncomeKind;
                setKind(next);
                if (!touchedTemplate) setTemplateId(templateFor(next)?.id ?? "none");
              }}
            >
              {INCOME_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`kinds.${value}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("incomeAccount")} htmlFor="payday-account">
            <GroupedPicker
              id="payday-account"
              name="accountId"
              value={accountId}
              onChange={setAccountId}
              options={accounts}
              placeholder={tCommon("none")}
              aria-label={t("incomeAccount")}
            />
          </Field>
        </div>

        <Field
          label={t("template")}
          htmlFor="payday-template"
          hint={suggested ? t("templateSuggestedHint", { name: suggested.name }) : t("templateMissingHint")}
        >
          <Select
            id="payday-template"
            name="templateId"
            value={templateId}
            onChange={(event) => {
              setTouchedTemplate(true);
              setTemplateId(event.target.value);
            }}
          >
            <option value="none">{t("templateNone")}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.lineCount})
              </option>
            ))}
          </Select>
        </Field>

        {state.status === "error" && !state.fieldErrors ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {state.messageKey === "payday.alreadySplit" ? t("alreadySplit") : t("startFailed")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="mode" value="wizard" size="lg" disabled={pending}>
            {pending ? tCommon("saving") : t("start")}
          </Button>
          <Button
            type="submit"
            name="mode"
            value="quick"
            size="lg"
            variant="secondary"
            disabled={pending || templateId === "none"}
          >
            {t("startQuick")}
          </Button>
        </div>
        <p className="text-xs text-ink-muted">{t("startQuickHelp")}</p>
      </form>
    </Card>
  );
}
