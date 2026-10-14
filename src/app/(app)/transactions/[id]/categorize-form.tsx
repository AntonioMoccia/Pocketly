"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { categorizeAction, ignoreTransactionAction } from "@/app/actions/transactions";
import { idleState } from "@/lib/action-state";
import { Badge, Button, Card, Checkbox, Select, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";

type Category = {
  id: string;
  name: string;
  kind: "expense" | "income" | "transfer";
  defaultEnvelopeId: string | null;
};

type Envelope = {
  id: string;
  name: string;
  kind: "real" | "virtual";
  accountName: string;
  availableCents: number;
};

/**
 * Categorizzazione di un movimento: la categoria dice cosa hai comprato, la
 * busta con quali soldi. La busta predefinita della categoria si applica da
 * sola, ma resta sempre cambiabile: sono due assi indipendenti.
 */
export function CategorizeForm({
  transaction,
  categories,
  envelopes,
  suggestion,
  locale,
  nextId,
}: {
  transaction: {
    id: string;
    description: string;
    counterparty: string | null;
    amount: number;
    currency: string;
    date: string;
    dateLabel: string;
    accountName: string;
    categoryId: string | null;
    envelopeId: string | null;
    ignored: boolean;
    isTransfer: boolean;
  };
  categories: Category[];
  envelopes: Envelope[];
  suggestion: { value: string; wouldMatch: number } | null;
  locale: string;
  nextId: string | null;
}) {
  const t = useTranslations("transactions");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [state, action, pending] = useActionState(categorizeAction, idleState);

  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [envelopeId, setEnvelopeId] = useState(transaction.envelopeId ?? "");
  const [touchedEnvelope, setTouchedEnvelope] = useState(false);

  const relevant = categories.filter((category) =>
    transaction.amount > 0 ? category.kind !== "expense" : category.kind !== "income",
  );
  // Le prime quattro come pillole, il resto nella tendina: la maggior parte
  // delle spese cade in poche categorie ricorrenti.
  const quick = relevant.slice(0, 4);

  const selected = categories.find((category) => category.id === categoryId);
  const effectiveEnvelopeId =
    touchedEnvelope || envelopeId ? envelopeId : (selected?.defaultEnvelopeId ?? "");
  const envelope = envelopes.find((row) => row.id === effectiveEnvelopeId);

  function choose(id: string) {
    setCategoryId(id);
    if (!touchedEnvelope) {
      const category = categories.find((row) => row.id === id);
      setEnvelopeId(category?.defaultEnvelopeId ?? "");
    }
  }

  return (
    <Card className="p-5">
      <div className="text-center">
        <p
          className={cn(
            "tabular text-4xl font-extrabold",
            transaction.amount > 0 ? "text-good" : "text-ink",
          )}
        >
          {formatMoney(transaction.amount, transaction.currency, locale)}
        </p>
        <p className="mt-1 text-lg font-semibold text-ink">{transaction.description}</p>
        <p className="text-sm text-ink-muted">
          {transaction.dateLabel} · {transaction.accountName}
        </p>
        {transaction.isTransfer ? (
          <Badge tone="neutral" className="mt-2">
            {t("transferExcluded")}
          </Badge>
        ) : null}
      </div>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="transactionId" value={transaction.id} />

        <fieldset>
          <legend className="text-sm font-medium text-ink-secondary">{t("category")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {quick.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => choose(category.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  categoryId === category.id
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-border bg-surface-1 text-ink-secondary hover:border-border-strong",
                )}
              >
                {category.name}
              </button>
            ))}
          </div>

          <Select
            className="mt-2"
            name="categoryId"
            value={categoryId}
            onChange={(event) => choose(event.target.value)}
            aria-label={t("category")}
          >
            <option value="">{t("noCategory")}</option>
            {relevant.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </fieldset>

        <div className="rounded-card border border-border p-3.5">
          <p className="text-xs text-ink-muted">{t("envelope")}</p>
          <Select
            name="envelopeId"
            value={effectiveEnvelopeId}
            onChange={(event) => {
              setTouchedEnvelope(true);
              setEnvelopeId(event.target.value);
            }}
            className="mt-1.5"
            aria-label={t("envelope")}
          >
            <option value="">{t("noEnvelope")}</option>
            {envelopes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.accountName} · {row.name}
              </option>
            ))}
          </Select>
          {envelope ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              {selected?.defaultEnvelopeId === envelope.id && !touchedEnvelope
                ? t("envelopeDefaultOf", { category: selected?.name ?? "" })
                : null}{" "}
              {t("availableAfter", {
                amount: formatMoney(
                  envelope.availableCents + (transaction.amount < 0 ? transaction.amount : 0),
                  transaction.currency,
                  locale,
                ),
              })}
            </p>
          ) : null}
        </div>

        {suggestion && categoryId ? (
          <div className="rounded-card bg-good-soft p-3.5">
            <Checkbox
              name="createRule"
              defaultChecked
              label={t("createRule")}
              description={t("createRuleDesc", {
                value: suggestion.value,
                count: suggestion.wouldMatch,
              })}
            />
          </div>
        ) : null}

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {tCommon("error")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={pending} className="flex-1">
            {pending ? tCommon("saving") : nextId ? t("saveAndNext") : tCommon("save")}
          </Button>
          {nextId ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => router.push(`/transactions/${nextId}`)}
            >
              {t("skip")}
            </Button>
          ) : null}
        </div>
      </form>

      <form action={ignoreTransactionAction} className="mt-4 border-t border-border pt-4">
        <input type="hidden" name="transactionId" value={transaction.id} />
        <input type="hidden" name="ignored" value={transaction.ignored ? "false" : "true"} />
        <Button type="submit" variant="ghost" size="sm">
          {transaction.ignored ? t("unignore") : t("ignore")}
        </Button>
      </form>
    </Card>
  );
}
