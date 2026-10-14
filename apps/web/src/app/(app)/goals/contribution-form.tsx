"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { addContributionAction } from "@/app/actions/misc";
import { idleState } from "@/lib/action-state";
import { AmountInput, Button, Field, Input, Select } from "@/components/ui";

/** Registro di PAC e buoni (F1.10): versamenti e rimborsi, a mano. */
export function ContributionForm({
  accounts,
}: {
  accounts: { id: string; name: string; currency: string }[];
}) {
  const t = useTranslations("investments");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addContributionAction, idleState);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state.status]);

  if (accounts.length === 0) return null;

  const currency = accounts.find((account) => account.id === accountId)?.currency ?? "EUR";

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + {t("contribution")}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("addContribution")}
            className="w-full max-w-md rounded-t-card bg-surface-1 p-5 sm:rounded-card"
          >
            <h2 className="text-xl font-bold text-ink">{t("addContribution")}</h2>

            <form action={action} className="mt-4 space-y-4">
              <Field label={t("account")} htmlFor="contribution-account">
                <Select
                  id="contribution-account"
                  name="accountId"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <input type="hidden" name="currency" value={currency} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tCommon("amount")} htmlFor="contribution-amount">
                  <AmountInput id="contribution-amount" name="amount" required placeholder="0,00" />
                </Field>

                <Field label={tCommon("date")} htmlFor="contribution-date">
                  <Input
                    id="contribution-date"
                    name="date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
              </div>

              <Field label={t("contributionKind")} htmlFor="contribution-kind">
                <Select id="contribution-kind" name="kind" defaultValue="deposit">
                  <option value="deposit">{t("kinds.deposit")}</option>
                  <option value="withdrawal">{t("kinds.withdrawal")}</option>
                </Select>
              </Field>

              {state.status === "error" ? (
                <p className="text-sm font-medium text-critical" role="alert">
                  {tCommon("error")}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? tCommon("saving") : tCommon("save")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {tCommon("cancel")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
