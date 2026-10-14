import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { currentNetWorth, netWorthHistory, previousSnapshot } from "@/data/networth";
import { listAccounts } from "@/data/accounts";
import { listEnvelopes } from "@/data/envelopes";
import { listGoals } from "@/data/goals";
import { openPayday } from "@/data/payday";
import { listTransferTodos, uncategorizedCount } from "@/data/transactions";
import { buildAccountTree, flattenTree, ACCOUNT_CATEGORIES } from "@pocketly/domain/networth";
import { formatMoney } from "@pocketly/domain/money";
import { daysBetween, formatDate, startOfMonth, today } from "@pocketly/domain/date";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, LinkButton, pocketTone, Progress } from "@/components/ui";
import { CategoryBar, MonthlyTrend } from "@/components/charts";

export const dynamic = "force-dynamic";

/** Giorni oltre i quali un saldo si considera vecchio. */
const STALE_DAYS = 35;

export default async function OverviewPage() {
  const context = await requireContext();
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const { locale, household } = context;
  const currency = household.baseCurrency;
  const now = today();

  const [netWorth, history, previous, accounts, envelopes, goals, payday, todos, pending] =
    await Promise.all([
      currentNetWorth(currency),
      netWorthHistory(6),
      previousSnapshot(startOfMonth(now)),
      listAccounts(),
      listEnvelopes(),
      listGoals(currency),
      openPayday(),
      listTransferTodos(),
      uncategorizedCount(now),
    ]);

  const delta = previous ? netWorth.totalCents - previous.total : null;
  // I saldi si aggiornano sui Pocket: e li che si guarda se sono vecchi.
  const stale = accounts.filter(
    (account) =>
      account.parentId &&
      (!account.balanceDate || daysBetween(account.balanceDate, now) > STALE_DAYS),
  );
  const overspent = envelopes.filter((envelope) => envelope.overspent);
  const pockets = flattenTree(buildAccountTree(accounts)).filter(
    (account) => account.parentId && !account.isDefault,
  );
  const activeGoals = goals.filter((goal) => goal.status === "active").slice(0, 3);

  const slices = ACCOUNT_CATEGORIES.map((category, index) => ({
    key: category,
    label: t(`categories.${category}`),
    value: netWorth.byCategory[category],
    colorIndex: index,
  })).filter((slice) => slice.value !== 0);

  // Le colonne del grafico sono mensili: uno snapshot per mese, l'ultimo vince.
  const monthly = new Map<string, { date: string; total: number }>();
  for (const row of history) {
    monthly.set(startOfMonth(row.date), { date: startOfMonth(row.date), total: row.total });
  }
  const points = [...monthly.values()].slice(-6);

  return (
    <div className="space-y-5">
      <header className="mb-1">
        <p className="text-sm text-ink-muted">{formatDate(now, locale, "long")}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {overspent.length > 0 || stale.length > 0
            ? t("greetingAttention", { name: firstName(context.user.name) })
            : t("greetingCalm", { name: firstName(context.user.name) })}
        </h1>
      </header>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/accounts/balances" variant="secondary">
          {tNav("balances")}
        </LinkButton>
        <LinkButton href="/payday">{t("startPayday")}</LinkButton>
      </div>

      {netWorth.missingRates.length > 0 ? (
        <Alert tone="warning">{t("missingRates", { currencies: netWorth.missingRates.join(", ") })}</Alert>
      ) : null}

      {overspent.length > 0 ? (
        <Alert
          tone="critical"
          title={t("overspentTitle", { count: overspent.length })}
          action={
            <LinkButton href={`/envelopes/${overspent[0]!.id}`} size="sm" variant="secondary">
              {t("coverNow")}
            </LinkButton>
          }
        >
          {overspent
            .slice(0, 3)
            .map((envelope) => `${envelope.name} ${formatMoney(envelope.availableCents, currency, locale)}`)
            .join(" · ")}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <p className="text-sm text-ink-secondary">{t("netWorth")}</p>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <p className="hero-figure tabular text-ink">
              {formatMoney(netWorth.totalCents, currency, locale, { compact: true })}
            </p>
            <p className="text-sm text-ink-secondary">
              {t("liquidInline", {
                amount: formatMoney(netWorth.liquidCents, currency, locale, { compact: true }),
              })}
            </p>
          </div>

          {delta !== null ? (
            <p className="mt-2">
              <Badge tone={delta >= 0 ? "good" : "critical"}>
                {formatMoney(delta, currency, locale, { showSign: true, compact: true })}{" "}
                {t("sincePrevious", { date: formatDate(previous!.date, locale) })}
              </Badge>
            </p>
          ) : null}

          <div className="mt-4">
            <CategoryBar
              slices={slices}
              currency={currency}
              locale={locale}
              emptyLabel={t("noBalances")}
            />
          </div>
        </Card>

        <PaydayCard payday={payday} currency={currency} locale={locale} />
      </div>

      {pockets.length > 0 ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <CardTitle>{t("yourPockets")}</CardTitle>
            <Link href="/accounts" className="text-sm font-semibold text-accent hover:underline">
              {t("allAccounts")}
            </Link>
          </div>
          <ul className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 no-scrollbar">
            {pockets.slice(0, 8).map((pocket, index) => (
              <li key={pocket.id} className="shrink-0">
                <Link
                  href={`/accounts/${pocket.id}`}
                  className={`flex min-w-36 flex-col gap-4 rounded-card px-4 py-3.5 ${pocketTone(index)}`}
                >
                  <span className="text-sm font-medium">{pocket.name}</span>
                  <span className="tabular text-xl font-bold">
                    {formatMoney(pocket.balanceCents, pocket.currency, locale, { compact: true })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("goals")}</CardTitle>
            <Link href="/goals" className="text-sm font-semibold text-accent hover:underline">
              {t("details")}
            </Link>
          </CardHeader>
          <CardBody className="space-y-4">
            {activeGoals.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noGoals")}</p>
            ) : (
              activeGoals.map((goal) => (
                <div key={goal.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold text-ink">{goal.name}</p>
                    <p className="tabular text-sm text-ink-secondary">
                      {formatMoney(goal.progress.currentCents, goal.currency, locale, { compact: true })}
                      {goal.targetCents > 0
                        ? ` / ${formatMoney(goal.targetCents, goal.currency, locale, { compact: true })}`
                        : null}
                    </p>
                  </div>
                  <Progress
                    className="mt-2"
                    value={goal.progress.ratio}
                    tone={goal.progress.reached ? "good" : goal.progress.overdue ? "warning" : "accent"}
                    label={goal.name}
                  />
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {goal.targetCents === 0
                      ? t("goalNoTarget")
                      : goal.progress.perMonthCents !== null && !goal.progress.reached
                        ? t("goalPace", {
                            percent: Math.round(goal.progress.ratio * 100),
                            amount: formatMoney(goal.progress.perMonthCents, goal.currency, locale, {
                              compact: true,
                            }),
                          })
                        : t("goalRemaining", {
                            amount: formatMoney(goal.progress.remainingCents, goal.currency, locale, {
                              compact: true,
                            }),
                          })}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("trend")}</CardTitle>
            <span className="text-sm text-ink-muted">{t("lastMonths", { count: 6 })}</span>
          </CardHeader>
          <CardBody>
            <MonthlyTrend
              points={points}
              currency={currency}
              locale={locale}
              emptyLabel={t("trendEmpty")}
            />
          </CardBody>
        </Card>
      </div>

      {(stale.length > 0 || todos.length > 0 || pending > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {stale.length > 0 ? (
            <Alert
              tone="warning"
              title={t("staleBalances")}
              action={
                <LinkButton href="/accounts/balances" size="sm" variant="secondary">
                  {t("updateNow")}
                </LinkButton>
              }
            >
              {t("staleBalancesDesc", { count: stale.length, days: STALE_DAYS })}
            </Alert>
          ) : null}

          {todos.length > 0 ? (
            <Alert
              tone="warning"
              title={t("transfersTodo", { count: todos.length })}
              action={
                <LinkButton href="/transactions" size="sm" variant="secondary">
                  {t("details")}
                </LinkButton>
              }
            >
              {todos
                .slice(0, 2)
                .map(
                  (todo) =>
                    `${todo.fromAccountName} → ${todo.toAccountName} ${formatMoney(todo.amount, todo.currency.trim(), locale, { compact: true })}`,
                )
                .join(" · ")}
            </Alert>
          ) : null}

          {pending > 0 ? (
            <Alert
              tone="accent"
              title={t("toCategorize", { count: pending })}
              action={
                <LinkButton href="/transactions?filter=uncategorized" size="sm" variant="secondary">
                  {t("details")}
                </LinkButton>
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

async function PaydayCard({
  payday,
  currency,
  locale,
}: {
  payday: Awaited<ReturnType<typeof openPayday>>;
  currency: string;
  locale: string;
}) {
  const t = await getTranslations("dashboard");

  if (payday) {
    return (
      <Card tone="accent" className="flex flex-col p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-accent">{t("openPayday")}</p>
        <p className="mt-1 text-2xl font-extrabold text-ink">{formatDate(payday.date, locale)}</p>
        <p className="mt-1 text-sm text-ink-secondary">
          {t("openPaydayDesc", {
            amount: formatMoney(payday.plan.unassignedCents, payday.currency, locale, {
              compact: true,
            }),
          })}
        </p>
        <dl className="mt-4 space-y-1.5 rounded-2xl bg-surface-1 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-secondary">{t("income")}</dt>
            <dd className="tabular font-semibold text-ink">
              {formatMoney(payday.amountCents, payday.currency, locale, { compact: true })}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-secondary">{t("transfersDone")}</dt>
            <dd className="tabular font-semibold text-ink">
              {payday.allocations.filter((line) => line.done).length} / {payday.allocations.length}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-secondary">{t("toAssign")}</dt>
            <dd
              className={`tabular font-bold ${payday.plan.unassignedCents === 0 ? "text-good" : "text-critical"}`}
            >
              {formatMoney(payday.plan.unassignedCents, payday.currency, locale, { compact: true })}
            </dd>
          </div>
        </dl>
        <LinkButton href={`/payday/${payday.id}`} className="mt-4 w-full">
          {t("resumePayday")}
        </LinkButton>
      </Card>
    );
  }

  return (
    <Card tone="accent" className="flex flex-col p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">{t("nextPayday")}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{t("noIncome")}</p>
      <p className="mt-1 text-sm text-ink-secondary">{t("noIncomeDesc")}</p>
      <div className="mt-auto pt-4">
        <LinkButton href="/payday" className="w-full">
          {t("startPayday")}
        </LinkButton>
      </div>
    </Card>
  );
}

export const metadata = { title: "Panoramica" };
