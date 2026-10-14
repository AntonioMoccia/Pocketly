"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveBalancesAction } from "@/app/actions/accounts";
import { idleState } from "@/lib/action-state";
import { AmountInput, Button, Card, Input, Label } from "@/components/ui";
import { formatMoney, toMajor } from "@pocketly/domain/money";

export type BalanceAccount = {
  id: string;
  name: string;
  currency: string;
  balanceCents: number;
  balanceDate: string | null;
  institutionName: string | null;
  parentId: string | null;
  isDefault: boolean;
  parentName: string | null;
};

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * Aggiornamento rapido dei saldi (F1.5): tutti i Pocket in una schermata, un
 * campo per Pocket, un salvataggio solo. Il valore attuale e precompilato,
 * cosi si corregge solo quello che e cambiato.
 *
 * I conti principali non hanno un campo: il loro saldo e la somma dei Pocket,
 * compreso quello di default.
 */
export function BalancesPanel({
  accounts,
  locale,
  today,
  compact = false,
}: {
  accounts: BalanceAccount[];
  locale: string;
  today: string;
  compact?: boolean;
}) {
  const t = useTranslations("balances");
  const [state, action, pending] = useActionState(saveBalancesAction, idleState);

  // Un gruppo per conto principale, in ordine alfabetico: prima il Pocket di
  // default, poi gli altri Pocket in ordine alfabetico.
  const groups = new Map<string, { title: string; rows: BalanceAccount[] }>();
  for (const account of accounts) {
    if (account.parentId === null || account.parentName === null) continue;
    const group = groups.get(account.parentId) ?? { title: account.parentName, rows: [] };
    group.rows.push(account);
    groups.set(account.parentId, group);
  }
  const ordered = [...groups.entries()]
    .sort(([, a], [, b]) => collator.compare(a.title, b.title))
    .map(([id, group]) => ({
      id,
      title: group.title,
      rows: [...group.rows].sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault) || collator.compare(a.name, b.name),
      ),
    }));

  return (
    <Card tone={compact ? "plain" : "accent"} className="p-5">
      <h2 className="text-lg font-bold text-ink">{t("title")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>

      <form action={action} className="mt-4 space-y-5">
        <div>
          <Label htmlFor="balance-date">{t("asOf")}</Label>
          <Input
            id="balance-date"
            name="date"
            type="date"
            defaultValue={today}
            max={today}
            className="mt-1.5 bg-surface-1"
          />
        </div>

        {ordered.map((group) => (
          <fieldset key={group.id} className="space-y-2.5">
            <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              {group.title}
            </legend>
            {group.rows.map((account) => (
              <div key={account.id}>
                <Label htmlFor={`balance-${account.id}`} className="text-ink">
                  {account.name}
                </Label>
                <AmountInput
                  id={`balance-${account.id}`}
                  name={`balance:${account.id}`}
                  defaultValue={formatPlain(account.balanceCents, account.currency, locale)}
                  aria-invalid={Boolean(state.fieldErrors?.[`balance:${account.id}`])}
                  className="mt-1.5 bg-surface-1"
                />
                <input type="hidden" name={`currency:${account.id}`} value={account.currency} />
                <input type="hidden" name={`previous:${account.id}`} value={account.balanceCents} />
                {state.fieldErrors?.[`balance:${account.id}`] ? (
                  <p className="mt-1 text-xs font-medium text-critical">{t("invalidAmount")}</p>
                ) : (
                  <p className="mt-1 text-xs text-ink-muted">
                    {account.balanceDate
                      ? t("lastUpdateOn", {
                          amount: formatMoney(account.balanceCents, account.currency, locale, {
                            compact: true,
                          }),
                          date: account.balanceDate,
                        })
                      : t("never")}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
        ))}

        {state.status === "error" && !state.fieldErrors ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {t("saveFailed")}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p className="text-sm font-medium text-good" role="status">
            {state.messageKey === "balances.nothingToSave"
              ? t("nothingToSave")
              : t("saved", { count: Number(state.messageValues?.count ?? 0) })}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("saving") : t("saveAll")}
        </Button>
      </form>
    </Card>
  );
}

/** Valore modificabile: numero semplice, senza simbolo di valuta. */
function formatPlain(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMajor(cents, currency));
}
