"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { coverOverspendAction } from "@/app/actions/envelopes";
import { idleState } from "@/lib/action-state";
import { AmountInput, Button, Card, Field, cn } from "@/components/ui";
import { formatMoney, parseAmountToCents, toMajor } from "@/lib/money";

type Option = {
  envelopeId: string;
  name: string;
  availableCents: number;
  kind: "real" | "virtual";
  needsTransfer: boolean;
  discouraged: boolean;
};

/**
 * Pannello "Copri da...": sposta assegnato da un'altra busta e, se le due
 * stanno su conti diversi, mette in lista il giroconto da fare. Mostrare
 * l'effetto prima di confermare e il punto: chi sceglie deve vedere cosa
 * cambia nelle due buste.
 */
export function CoverPanel({
  envelope,
  options,
  locale,
}: {
  envelope: { id: string; name: string; overspentByCents: number; currency: string };
  options: Option[];
  locale: string;
}) {
  const t = useTranslations("envelopes");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(coverOverspendAction, idleState);

  const [fromId, setFromId] = useState(options[0]?.envelopeId ?? "");
  const [amountText, setAmountText] = useState(
    plain(envelope.overspentByCents, envelope.currency, locale),
  );

  const amount = parseAmountToCents(amountText, envelope.currency) ?? 0;
  const source = options.find((option) => option.envelopeId === fromId);

  if (options.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-bold text-ink">{t("coverTitle", { amount: "" })}</h2>
        <p className="mt-2 text-sm text-ink-secondary">{t("noCoverage")}</p>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-accent p-5 lg:sticky lg:top-20">
      <h2 className="text-lg font-bold text-ink">
        {t("coverTitle", {
          amount: formatMoney(envelope.overspentByCents, envelope.currency, locale, { compact: true }),
        })}
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("coverDesc")}</p>

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="toEnvelopeId" value={envelope.id} />
        <input type="hidden" name="currency" value={envelope.currency} />

        <fieldset className="space-y-2">
          <legend className="sr-only">{t("coverFrom")}</legend>
          {options.slice(0, 5).map((option) => (
            <label
              key={option.envelopeId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors",
                fromId === option.envelopeId
                  ? "border-accent bg-accent-soft/40"
                  : "border-border hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name="fromEnvelopeId"
                value={option.envelopeId}
                checked={fromId === option.envelopeId}
                onChange={() => setFromId(option.envelopeId)}
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-bold text-ink">{option.name}</span>
                  <span className="tabular shrink-0 font-bold text-ink">
                    {formatMoney(option.availableCents, envelope.currency, locale, { compact: true })}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    option.discouraged ? "text-warning" : "text-ink-muted",
                  )}
                >
                  {option.discouraged
                    ? t("discouraged")
                    : option.needsTransfer
                      ? `${t(`kinds.${option.kind}`)} · ${t("needsTransfer")}`
                      : `${t(`kinds.${option.kind}`)} · ${t("sameAccount")}`}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <Field label={tCommon("amount")} htmlFor="cover-amount">
          <AmountInput
            id="cover-amount"
            name="amount"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
        </Field>

        {source && amount > 0 ? (
          <dl className="space-y-1.5 rounded-card bg-surface-2 p-3.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{envelope.name}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(-envelope.overspentByCents, envelope.currency, locale, { compact: true })}{" "}
                →{" "}
                {formatMoney(amount - envelope.overspentByCents, envelope.currency, locale, {
                  compact: true,
                })}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{source.name}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(source.availableCents, envelope.currency, locale, { compact: true })} →{" "}
                {formatMoney(source.availableCents - amount, envelope.currency, locale, {
                  compact: true,
                })}
              </dd>
            </div>
            {source.needsTransfer ? (
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="text-ink-secondary">{t("transferToDo")}</dt>
                <dd className="tabular font-bold text-ink">
                  {source.name} → {envelope.name}{" "}
                  {formatMoney(amount, envelope.currency, locale, { compact: true })}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {tCommon("error")}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p className="text-sm font-medium text-good" role="status">
            {state.messageKey === "envelopes.coveredWithTransfer"
              ? t("coveredWithTransfer")
              : t("covered")}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending || amount <= 0}>
          {pending
            ? tCommon("saving")
            : t("coverAction", {
                amount: formatMoney(amount, envelope.currency, locale, { compact: true }),
                name: source?.name ?? "",
              })}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-ink-muted">{t("leaveUncovered")}</p>
    </Card>
  );
}

function plain(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(toMajor(cents, currency));
}
