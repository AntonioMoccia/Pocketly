"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  closePaydayAction,
  deleteIncomeAction,
  markAllDoneAction,
  reopenPaydayAction,
  saveAllocationsAction,
  toggleAllocationAction,
} from "@/app/actions/payday";
import { idleState } from "@/lib/action-state";
import {
  AmountInput,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  cn,
  pocketDot,
} from "@/components/ui";
import { GroupedPicker } from "@/components/grouped-picker";
import { BalancesPanel, type BalanceAccount } from "../../accounts/balances-panel";
import { computeAllocation, type AllocationLineInput } from "@pocketly/domain/allocation";
import { formatMoney, parseAmountToCents, toMajor } from "@pocketly/domain/money";

type Line = {
  id: string;
  label: string;
  kind: "fixed" | "percent" | "remainder";
  envelopeId: string | null;
  plannedCents: number;
  actualCents: number | null;
  done: boolean;
  percentBps: number;
  percentBasis: "gross" | "remaining";
  priority: number;
};

type Envelope = {
  id: string;
  name: string;
  kind: "real" | "virtual";
  color: number;
  accountId: string;
  accountName: string;
  mainAccountName: string;
};

export type PaydayView = {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  accountId: string | null;
  closed: boolean;
  unassignedCents: number;
  assignedCents: number;
  canClose: boolean;
  lines: Line[];
};

const STEPS = [1, 2, 3, 4] as const;

export function PaydayWizard({
  step,
  payday,
  envelopes,
  accounts,
  locale,
  today,
  title,
  dateLabel,
}: {
  step: number;
  payday: PaydayView;
  envelopes: Envelope[];
  accounts: BalanceAccount[];
  locale: string;
  today: string;
  title: string;
  dateLabel: string;
}) {
  const t = useTranslations("payday");
  const current = Math.min(4, Math.max(1, step));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-ink-muted">
          {t("stepOf", { current, total: 4 })} · {dateLabel}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {current === 2 ? t("headline") : title}
        </h1>
      </header>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((number) => {
          const done = number < current;
          const active = number === current;
          return (
            <li key={number}>
              <Link
                href={`/payday/${payday.id}?step=${number}`}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-card px-4 py-3 transition-colors",
                  active
                    ? "border-2 border-accent bg-surface-1"
                    : done
                      ? "bg-good-soft"
                      : "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    active
                      ? "bg-accent text-white"
                      : done
                        ? "bg-good text-white"
                        : "bg-surface-1 text-ink-muted",
                  )}
                >
                  {done ? "✓" : number}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-ink-muted">{t("stepLabel", { number })}</span>
                  <span className="block truncate text-sm font-semibold text-ink">
                    {t(`step${number}`)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {current === 1 ? (
        <IncomeStep payday={payday} accounts={accounts} locale={locale} />
      ) : current === 2 ? (
        <AllocationStep payday={payday} envelopes={envelopes} locale={locale} />
      ) : current === 3 ? (
        <TransfersStep payday={payday} envelopes={envelopes} locale={locale} />
      ) : (
        <BalancesStep payday={payday} accounts={accounts} locale={locale} today={today} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 1 — entrata
// ---------------------------------------------------------------------------

function IncomeStep({
  payday,
  accounts,
  locale,
}: {
  payday: PaydayView;
  accounts: BalanceAccount[];
  locale: string;
}) {
  const t = useTranslations("payday");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(saveAllocationsAction, idleState);

  return (
    <Card className="max-w-lg p-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="incomeId" value={payday.id} />
        {payday.lines.map((line, index) => (
          <HiddenLine key={line.id} line={line} index={index} currency={payday.currency} locale={locale} />
        ))}

        <Field label={t("incomeAmount")} htmlFor="income-amount">
          <AmountInput
            id="income-amount"
            name="amount"
            defaultValue={plainAmount(payday.amountCents, payday.currency, locale)}
          />
        </Field>

        <p className="text-sm text-ink-secondary">{t("amountChangeHint")}</p>

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical">{t("invalidAmount")}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
          <Link
            href={`/payday/${payday.id}?step=2`}
            className="inline-flex h-11 items-center rounded-full bg-surface-2 px-5 font-semibold text-ink"
          >
            {t("goToAllocation")}
          </Link>
        </div>
      </form>

      <form action={deleteIncomeAction} className="mt-6 border-t border-border pt-4">
        <input type="hidden" name="incomeId" value={payday.id} />
        <Button type="submit" variant="ghost" size="sm" className="text-critical">
          {t("deleteIncome")}
        </Button>
      </form>
    </Card>
  );
}

/** Le righe non modificate vanno rispedite, altrimenti il salvataggio le perde. */
function HiddenLine({
  line,
  index,
  currency,
  locale,
}: {
  line: Line;
  index: number;
  currency: string;
  locale: string;
}) {
  return (
    <>
      <input type="hidden" name={`line.${index}.id`} value={line.id} />
      <input type="hidden" name={`line.${index}.label`} value={line.label} />
      <input type="hidden" name={`line.${index}.kind`} value={line.kind} />
      <input type="hidden" name={`line.${index}.envelopeId`} value={line.envelopeId ?? ""} />
      <input
        type="hidden"
        name={`line.${index}.amount`}
        value={plainAmount(line.plannedCents, currency, locale)}
      />
      <input type="hidden" name={`line.${index}.percent`} value={line.percentBps / 100} />
      <input type="hidden" name={`line.${index}.percentBasis`} value={line.percentBasis} />
      <input type="hidden" name={`line.${index}.priority`} value={line.priority} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Passo 2 — ripartizione
// ---------------------------------------------------------------------------

function AllocationStep({
  payday,
  envelopes,
  locale,
}: {
  payday: PaydayView;
  envelopes: Envelope[];
  locale: string;
}) {
  const t = useTranslations("payday");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(saveAllocationsAction, idleState);

  const [lines, setLines] = useState<Line[]>(payday.lines);
  const envelopeById = useMemo(
    () => new Map(envelopes.map((envelope) => [envelope.id, envelope])),
    [envelopes],
  );

  // Il piano si ricalcola a ogni tasto: "da assegnare" deve rispondere subito,
  // altrimenti non e un controllo ma un referto.
  const plan = useMemo(() => {
    const inputs: AllocationLineInput[] = lines.map((line) => ({
      id: line.id,
      label: line.label,
      kind: line.kind,
      envelopeId: line.envelopeId,
      amountCents: line.plannedCents,
      percentBps: line.percentBps,
      percentBasis: line.percentBasis,
      priority: line.priority,
    }));
    return computeAllocation(payday.amountCents, inputs);
  }, [lines, payday.amountCents]);

  const unassigned = plan.unassignedCents;

  function update(id: string, patch: Partial<Line>) {
    setLines((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addLine() {
    setLines((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        label: "",
        kind: "fixed",
        envelopeId: envelopes[0]?.id ?? null,
        plannedCents: 0,
        actualCents: null,
        done: false,
        percentBps: 0,
        percentBasis: "gross",
        priority: rows.length + 1,
      },
    ]);
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <input type="hidden" name="incomeId" value={payday.id} />

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{t("linesTitle")}</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            + {t("addLine")}
          </Button>
        </div>

        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_7rem_auto] gap-3 px-2 pb-2 text-xs font-semibold text-ink-muted sm:grid">
          <span>{t("lineLabel")}</span>
          <span>{t("lineDestination")}</span>
          <span>{t("lineKind")}</span>
          <span className="text-right">{tCommon("amount")}</span>
        </div>

        <ul className="space-y-2">
          {lines.map((line, index) => {
            const planned =
              plan.lines.find((row) => row.id === line.id)?.plannedCents ?? line.plannedCents;
            const envelope = line.envelopeId ? envelopeById.get(line.envelopeId) : undefined;
            const isRemainder = line.kind === "remainder";

            return (
              <li
                key={line.id}
                className={cn(
                  "grid grid-cols-1 gap-2 rounded-chip px-2 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_7rem_auto] sm:items-center",
                  isRemainder ? "bg-good-soft" : index % 2 === 0 ? "bg-surface-2/60" : null,
                )}
              >
                <div className="flex items-center gap-2">
                  {envelope ? (
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 shrink-0 rounded-full", pocketDot(envelope.color))}
                    />
                  ) : null}
                  <Input
                    name={`line.${index}.label`}
                    value={line.label}
                    onChange={(event) => update(line.id, { label: event.target.value })}
                    placeholder={t("lineLabelPlaceholder")}
                    className="h-10 border-transparent bg-transparent px-1 font-semibold"
                  />
                </div>

                <GroupedPicker
                  name={`line.${index}.envelopeId`}
                  value={line.envelopeId}
                  onChange={(envelopeId) => update(line.id, { envelopeId })}
                  options={envelopes}
                  placeholder={t("chooseEnvelope")}
                  className="h-10 border-transparent bg-transparent text-sm"
                  aria-label={t("lineDestination")}
                />

                <Select
                  name={`line.${index}.kind`}
                  value={line.kind}
                  onChange={(event) =>
                    update(line.id, { kind: event.target.value as Line["kind"] })
                  }
                  className="h-10 border-transparent bg-transparent text-sm"
                  aria-label={t("lineKind")}
                >
                  <option value="fixed">{t("kindsLine.fixed")}</option>
                  <option value="percent">{t("kindsLine.percent")}</option>
                  <option value="remainder">{t("kindsLine.remainder")}</option>
                </Select>

                <div className="flex items-center justify-end gap-2">
                  {line.kind === "percent" ? (
                    <>
                      <Input
                        name={`line.${index}.percent`}
                        inputMode="decimal"
                        value={String(line.percentBps / 100)}
                        onChange={(event) =>
                          update(line.id, {
                            percentBps: Math.round(
                              (Number(event.target.value.replace(",", ".")) || 0) * 100,
                            ),
                          })
                        }
                        className="tabular h-10 w-20 text-right"
                        aria-label={t("percent")}
                      />
                      <span className="text-sm text-ink-muted">%</span>
                    </>
                  ) : line.kind === "remainder" ? (
                    <>
                      <span className="tabular font-bold text-good">
                        {formatMoney(planned, payday.currency, locale, { compact: true })}
                      </span>
                      <input
                        type="hidden"
                        name={`line.${index}.amount`}
                        value={plainAmount(planned, payday.currency, locale)}
                      />
                    </>
                  ) : (
                    <AmountInput
                      name={`line.${index}.amount`}
                      value={plainAmount(line.plannedCents, payday.currency, locale)}
                      onChange={(event) =>
                        update(line.id, {
                          plannedCents:
                            parseAmountToCents(event.target.value, payday.currency) ?? 0,
                        })
                      }
                      className="h-10 w-28"
                      aria-label={tCommon("amount")}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setLines((rows) => rows.filter((row) => row.id !== line.id))}
                    className="rounded-lg px-1.5 py-1 text-ink-muted hover:text-critical"
                    aria-label={tCommon("delete")}
                  >
                    ×
                  </button>
                </div>

                <input type="hidden" name={`line.${index}.id`} value={line.id} />
                <input
                  type="hidden"
                  name={`line.${index}.percentBasis`}
                  value={line.percentBasis}
                />
                <input type="hidden" name={`line.${index}.priority`} value={index + 1} />
                {line.kind !== "percent" ? null : (
                  <input
                    type="hidden"
                    name={`line.${index}.amount`}
                    value="0"
                  />
                )}
              </li>
            );
          })}
        </ul>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t("noLines")}</p>
        ) : null}
      </Card>

      <div className="space-y-4 lg:sticky lg:top-20">
        <Card className="p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{t("income")}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(payday.amountCents, payday.currency, locale, { compact: true })}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{t("assigned")}</dt>
              <dd className="tabular font-semibold text-ink">
                {formatMoney(plan.assignedCents, payday.currency, locale, { compact: true })}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-border pt-4 text-center">
            <p className="text-sm text-ink-secondary">{t("unassigned")}</p>
            <p
              className={cn(
                "tabular mt-1 text-4xl font-extrabold",
                unassigned === 0 ? "text-good" : "text-critical",
              )}
            >
              {formatMoney(unassigned, payday.currency, locale, { compact: true })}
            </p>
            {unassigned === 0 ? (
              <Badge tone="good" className="mt-2">
                {t("everyEuroPlaced")}
              </Badge>
            ) : (
              <p className="mt-2 text-xs text-critical">
                {unassigned > 0 ? t("stillToAssign") : t("overAssigned")}
              </p>
            )}
          </div>

          {state.status === "error" ? (
            <p className="mt-3 text-sm font-medium text-critical" role="alert">
              {t("saveFailed")}
            </p>
          ) : null}
          {state.status === "success" ? (
            <p className="mt-3 text-sm font-medium text-good" role="status">
              {tCommon("saved")}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending}>
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>

          <Link
            href={`/payday/${payday.id}?step=3`}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-surface-2 font-semibold text-ink"
          >
            {t("goToTransfers")}
          </Link>
        </Card>

        <TransferSummary payday={payday} lines={lines} envelopes={envelopes} locale={locale} />
      </div>
    </form>
  );
}

/**
 * Bonifici aggregati per coppia di conti: quello che conta per fare i bonifici
 * non e la riga del budget ma quanto va spostato da una banca all'altra.
 */
function TransferSummary({
  payday,
  lines,
  envelopes,
  locale,
}: {
  payday: PaydayView;
  lines: Line[];
  envelopes: Envelope[];
  locale: string;
}) {
  const t = useTranslations("payday");
  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const accountName = new Map(envelopes.map((envelope) => [envelope.accountId, envelope.accountName]));

  const plan = computeAllocation(
    payday.amountCents,
    lines.map((line) => ({
      id: line.id,
      label: line.label,
      kind: line.kind,
      envelopeId: line.envelopeId,
      amountCents: line.plannedCents,
      percentBps: line.percentBps,
      percentBasis: line.percentBasis,
      priority: line.priority,
    })),
  );

  const groups = new Map<string, number>();
  for (const line of plan.lines) {
    if (!line.envelopeId || line.plannedCents === 0) continue;
    const envelope = envelopeById.get(line.envelopeId);
    if (!envelope) continue;
    const key = envelope.accountId;
    groups.set(key, (groups.get(key) ?? 0) + line.plannedCents);
  }

  if (groups.size === 0) return null;
  const source = payday.accountId;

  return (
    <Card tone="accent" className="p-5">
      <h3 className="font-bold text-ink">{t("transfersToDo")}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {[...groups.entries()].map(([accountId, amount]) => (
          <li key={accountId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-ink-secondary">
              {source && accountId === source
                ? t("staysOn", { account: accountName.get(accountId) ?? "" })
                : `${source ? `${accountName.get(source) ?? "?"} → ` : ""}${accountName.get(accountId) ?? ""}`}
            </span>
            <span className="tabular shrink-0 font-bold text-ink">
              {formatMoney(amount, payday.currency, locale, { compact: true })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Passo 3 — bonifici
// ---------------------------------------------------------------------------

function TransfersStep({
  payday,
  envelopes,
  locale,
}: {
  payday: PaydayView;
  envelopes: Envelope[];
  locale: string;
}) {
  const t = useTranslations("payday");
  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const pending = payday.lines.filter((line) => line.plannedCents !== 0 && !line.done).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{t("checklist")}</h2>
            <p className="mt-0.5 text-sm text-ink-secondary">{t("checklistHelp")}</p>
          </div>
          <form action={markAllDoneAction}>
            <input type="hidden" name="incomeId" value={payday.id} />
            <input type="hidden" name="done" value={pending > 0 ? "true" : "false"} />
            <Button type="submit" variant="secondary" size="sm">
              {pending > 0 ? t("markAllDone") : t("unmarkAll")}
            </Button>
          </form>
        </div>

        <ul className="divide-y divide-border">
          {payday.lines
            .filter((line) => line.plannedCents !== 0)
            .map((line) => {
              const envelope = line.envelopeId ? envelopeById.get(line.envelopeId) : undefined;
              return (
                <li key={line.id} className="flex items-center gap-3 py-3">
                  <form action={toggleAllocationAction} className="flex min-w-0 flex-1 items-center gap-3">
                    <input type="hidden" name="allocationId" value={line.id} />
                    <input type="hidden" name="incomeId" value={payday.id} />
                    <input type="hidden" name="done" value={line.done ? "false" : "true"} />
                    <button
                      type="submit"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        line.done
                          ? "border-good bg-good text-white"
                          : "border-border-strong text-transparent hover:border-accent",
                      )}
                      aria-label={line.done ? t("markUndone") : t("markDone")}
                    >
                      ✓
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{line.label}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {envelope
                          ? envelope.name === envelope.mainAccountName
                            ? envelope.name
                            : `${envelope.mainAccountName} · ${envelope.name}`
                          : t("noEnvelope")}
                      </span>
                    </span>
                  </form>
                  <span className="tabular shrink-0 font-bold text-ink">
                    {formatMoney(line.plannedCents, payday.currency, locale, { compact: true })}
                  </span>
                </li>
              );
            })}
        </ul>
      </Card>

      <Card className="p-5 lg:sticky lg:top-20">
        <p className="text-sm text-ink-secondary">{t("transfersDone")}</p>
        <p className="tabular mt-1 text-3xl font-extrabold text-ink">
          {payday.lines.filter((line) => line.done).length} /{" "}
          {payday.lines.filter((line) => line.plannedCents !== 0).length}
        </p>
        <Link
          href={`/payday/${payday.id}?step=4`}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-accent font-semibold text-white hover:bg-accent-hover"
        >
          {t("goToBalances")}
        </Link>
        <Link
          href={`/payday/${payday.id}?step=2`}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-surface-2 font-semibold text-ink"
        >
          {t("backToAllocation")}
        </Link>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 4 — saldi e chiusura
// ---------------------------------------------------------------------------

function BalancesStep({
  payday,
  accounts,
  locale,
  today,
}: {
  payday: PaydayView;
  accounts: BalanceAccount[];
  locale: string;
  today: string;
}) {
  const t = useTranslations("payday");
  const [state, action, pending] = useActionState(closePaydayAction, idleState);

  const blocked = payday.lines.filter((line) => line.plannedCents !== 0 && !line.done).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary">{t("balancesStep")}</p>
        <BalancesPanel compact accounts={accounts} locale={locale} today={today} />
      </div>

      <Card className="p-5 lg:sticky lg:top-20">
        {payday.closed ? (
          <>
            <Badge tone="good">{t("closed")}</Badge>
            <p className="mt-3 text-sm text-ink-secondary">{t("closedDesc")}</p>
            <form action={reopenPaydayAction} className="mt-4">
              <input type="hidden" name="incomeId" value={payday.id} />
              <Button type="submit" variant="outline" className="w-full">
                {t("reopen")}
              </Button>
            </form>
          </>
        ) : (
          <form action={action}>
            <input type="hidden" name="incomeId" value={payday.id} />

            <p className="text-sm text-ink-secondary">{t("unassigned")}</p>
            <p
              className={cn(
                "tabular mt-1 text-3xl font-extrabold",
                payday.unassignedCents === 0 ? "text-good" : "text-critical",
              )}
            >
              {formatMoney(payday.unassignedCents, payday.currency, locale, { compact: true })}
            </p>

            {blocked > 0 ? (
              <p className="mt-3 text-sm text-ink-secondary">
                {t("reasonNotDone", { count: blocked })}
              </p>
            ) : null}

            {state.status === "error" ? (
              <p className="mt-3 text-sm font-medium text-critical" role="alert">
                {state.messageKey === "payday.mustBeZero"
                  ? t("mustBeZero")
                  : t("reasonNotDone", { count: blocked })}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="mt-4 w-full"
              disabled={pending || !payday.canClose}
            >
              {pending ? t("closing") : t("close")}
            </Button>

            {!payday.canClose ? (
              <p className="mt-2 text-center text-xs text-ink-muted">{t("closeBlocked")}</p>
            ) : null}
          </form>
        )}
      </Card>
    </div>
  );
}

/** Valore per i campi modificabili: numero semplice, senza valuta. */
function plainAmount(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(toMajor(cents, currency));
}

export { Checkbox };
