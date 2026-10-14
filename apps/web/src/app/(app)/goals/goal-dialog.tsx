"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { deleteGoalAction, saveGoalAction } from "@/app/actions/misc";
import { idleState } from "@/lib/action-state";
import { AmountInput, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { toMajor } from "@pocketly/domain/money";

export type GoalData = {
  id: string;
  name: string;
  targetCents: number;
  currency: string;
  deadline: string | null;
  status: "active" | "reached" | "paused" | "archived";
  note: string | null;
  accountIds: string[];
};

/**
 * Creazione e modifica di un obiettivo in un dialogo nativo: nessuna libreria
 * di overlay, e la chiusura con Esc arriva gratis dal browser.
 */
export function GoalDialog({
  goal,
  accounts,
  baseCurrency,
  trigger = "button",
}: {
  goal?: GoalData;
  accounts: { id: string; name: string }[];
  baseCurrency: string;
  trigger?: "button" | "link";
}) {
  const t = useTranslations("goals");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveGoalAction, idleState);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state.status]);

  return (
    <>
      {trigger === "link" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          {t("edit")}
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>+ {t("new")}</Button>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={goal ? t("edit") : t("new")}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-surface-1 p-5 sm:rounded-card"
          >
            <h2 className="text-xl font-bold text-ink">{goal ? t("edit") : t("new")}</h2>

            <form action={action} className="mt-4 space-y-4">
              {goal ? <input type="hidden" name="goalId" value={goal.id} /> : null}

              <Field label={tCommon("name")} htmlFor="goal-name">
                <Input id="goal-name" name="name" required maxLength={80} defaultValue={goal?.name ?? ""} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("target")}
                  htmlFor="goal-target"
                  hint={t("targetHint")}
                  error={state.fieldErrors?.target ? tCommon("error") : undefined}
                >
                  <AmountInput
                    id="goal-target"
                    name="target"
                    defaultValue={goal ? plain(goal.targetCents, goal.currency) : ""}
                    placeholder="0,00"
                  />
                </Field>

                <Field label={t("deadline")} htmlFor="goal-deadline" hint={t("deadlineHint")}>
                  <Input
                    id="goal-deadline"
                    name="deadline"
                    type="date"
                    defaultValue={goal?.deadline ?? ""}
                  />
                </Field>
              </div>

              <input type="hidden" name="currency" value={goal?.currency ?? baseCurrency} />

              <Field label={tCommon("status")} htmlFor="goal-status">
                <Select id="goal-status" name="status" defaultValue={goal?.status ?? "active"}>
                  <option value="active">{t("status.active")}</option>
                  <option value="reached">{t("status.reached")}</option>
                  <option value="paused">{t("status.paused")}</option>
                  <option value="archived">{t("status.archived")}</option>
                </Select>
              </Field>

              <fieldset>
                <legend className="text-sm font-medium text-ink-secondary">
                  {t("linkedAccounts")}
                </legend>
                <p className="mb-2 text-xs text-ink-muted">{t("linkedAccountsHelp")}</p>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-field border border-border p-3">
                  {accounts.map((account) => (
                    <Checkbox
                      key={account.id}
                      name="accountIds"
                      value={account.id}
                      label={account.name}
                      defaultChecked={goal?.accountIds.includes(account.id)}
                    />
                  ))}
                </div>
              </fieldset>

              <Field label={tCommon("note")} htmlFor="goal-note">
                <Textarea id="goal-note" name="note" maxLength={500} defaultValue={goal?.note ?? ""} />
              </Field>

              {state.status === "error" ? (
                <p className="text-sm font-medium text-critical" role="alert">
                  {tCommon("error")}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? tCommon("saving") : tCommon("save")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {tCommon("cancel")}
                </Button>
              </div>
            </form>

            {goal ? (
              <form action={deleteGoalAction} className="mt-4 border-t border-border pt-4">
                <input type="hidden" name="goalId" value={goal.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-critical">
                  {tCommon("delete")}
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function plain(cents: number, currency: string): string {
  return toMajor(cents, currency).toFixed(2).replace(".", ",");
}
