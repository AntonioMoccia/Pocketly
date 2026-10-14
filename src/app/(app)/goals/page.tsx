import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listGoals } from "@/server/goals";
import { listInvestments } from "@/server/investments";
import { listAccounts } from "@/server/accounts";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/date";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Table,
  TableWrap,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { ProgressRing } from "@/components/charts";
import { GoalDialog } from "./goal-dialog";
import { ContributionForm } from "./contribution-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Obiettivi e investimenti" };

/** Tinte delle schede obiettivo, nell'ordine del disegno. */
const GOAL_TONES = [
  "bg-pocket-6 text-pocket-ink-6",
  "bg-pocket-2 text-pocket-ink-2",
  "bg-pocket-3 text-pocket-ink-3",
  "bg-pocket-1 text-pocket-ink-1",
] as const;

export default async function GoalsPage() {
  const context = await requireContext();
  const t = await getTranslations("goals");
  const tInv = await getTranslations("investments");
  const { household, locale } = context;

  const [goals, investments, accounts] = await Promise.all([
    listGoals(household.id, household.baseCurrency),
    listInvestments(household.id),
    listAccounts(household.id),
  ]);

  const active = goals.filter((goal) => goal.status !== "archived");
  const contributions = investments
    .flatMap((investment) =>
      investment.contributions.map((row) => ({ ...row, account: investment.account.name })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("activeCount", { count: active.filter((goal) => goal.status === "active").length })}
        title={t("title")}
        actions={
          <GoalDialog
            accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
            baseCurrency={household.baseCurrency}
          />
        }
      />

      {active.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((goal, index) => {
            const tone = GOAL_TONES[index % GOAL_TONES.length]!;
            const noTarget = goal.targetCents === 0;
            return (
              <Card key={goal.id} className={cn("p-5", tone)}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold">{goal.name}</h2>
                  <Badge className="bg-surface-1/80 text-current">
                    {noTarget
                      ? t("toSetUp")
                      : goal.progress.reached
                        ? t("reached")
                        : goal.progress.overdue
                          ? t("overdue")
                          : goal.deadline
                            ? t("inProgress")
                            : t("noDeadline")}
                  </Badge>
                </div>

                {noTarget ? (
                  <>
                    <p className="tabular mt-3 text-3xl font-extrabold">
                      {formatMoney(goal.progress.currentCents, goal.currency, locale, {
                        compact: true,
                      })}
                    </p>
                    <p className="mt-1 text-sm opacity-80">
                      {goal.accountNames.length > 0
                        ? t("accumulatedOn", { accounts: goal.accountNames.join(", ") })
                        : t("noLinkedAccounts")}
                    </p>
                    <p className="mt-4 rounded-2xl bg-surface-1/70 p-3 text-sm">
                      {t("setTargetHint")}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-4">
                      <ProgressRing value={goal.progress.ratio} locale={locale} size={92} thickness={12} />
                      <div className="min-w-0">
                        <p className="tabular text-2xl font-extrabold">
                          {formatMoney(goal.progress.currentCents, goal.currency, locale, {
                            compact: true,
                          })}
                        </p>
                        <p className="text-sm opacity-80">
                          {t("ofTarget", {
                            amount: formatMoney(goal.targetCents, goal.currency, locale, {
                              compact: true,
                            }),
                          })}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-4 space-y-1.5 rounded-2xl bg-surface-1/70 p-3.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="opacity-80">{t("remaining")}</dt>
                        <dd className="tabular font-bold">
                          {formatMoney(goal.progress.remainingCents, goal.currency, locale, {
                            compact: true,
                          })}
                        </dd>
                      </div>
                      {goal.progress.perMonthCents !== null ? (
                        <div className="flex justify-between gap-3">
                          <dt className="opacity-80">{t("perMonth")}</dt>
                          <dd className="tabular font-bold">
                            {formatMoney(goal.progress.perMonthCents, goal.currency, locale, {
                              compact: true,
                            })}
                          </dd>
                        </div>
                      ) : null}
                      {goal.deadline ? (
                        <div className="flex justify-between gap-3">
                          <dt className="opacity-80">{t("deadline")}</dt>
                          <dd className="font-bold">{formatDate(goal.deadline, locale)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </>
                )}

                <div className="mt-3">
                  <GoalDialog
                    goal={{
                      id: goal.id,
                      name: goal.name,
                      targetCents: goal.targetCents,
                      currency: goal.currency,
                      deadline: goal.deadline,
                      status: goal.status,
                      note: goal.note,
                      accountIds: goal.accountIds,
                    }}
                    accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
                    baseCurrency={household.baseCurrency}
                    trigger="link"
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{tInv("title")}</CardTitle>
            <span className="text-sm text-ink-muted">{tInv("phase3Note")}</span>
          </CardHeader>
          <CardBody>
            {investments.length === 0 ? (
              <p className="text-sm text-ink-muted">{tInv("empty")}</p>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{tInv("instrument")}</Th>
                      <Th>{tInv("kind")}</Th>
                      <Th className="text-right">{tInv("invested")}</Th>
                      <Th className="text-right">{tInv("value")}</Th>
                      <Th className="text-right">{tInv("difference")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.map((investment) => {
                      const { summary, account } = investment;
                      return (
                        <tr key={account.id} className="border-t border-border">
                          <Td className="font-semibold text-ink">{account.name}</Td>
                          <Td className="text-ink-secondary">
                            {tInv(`categories.${account.category}`)}
                          </Td>
                          <Td className="tabular text-right">
                            {formatMoney(summary.investedCents, account.currency, locale, {
                              compact: true,
                            })}
                          </Td>
                          <Td className="tabular text-right font-semibold">
                            {formatMoney(summary.valueCents, account.currency, locale, {
                              compact: true,
                            })}
                          </Td>
                          <Td
                            className={cn(
                              "tabular text-right font-semibold",
                              summary.gainCents > 0
                                ? "text-good"
                                : summary.gainCents < 0
                                  ? "text-critical"
                                  : "text-ink-muted",
                            )}
                          >
                            {summary.returnRatio === null || summary.gainCents === 0
                              ? "—"
                              : new Intl.NumberFormat(locale, {
                                  style: "percent",
                                  maximumFractionDigits: 1,
                                  signDisplay: "exceptZero",
                                }).format(summary.returnRatio)}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        <Card tone="accent" className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">{tInv("lastContributions")}</h2>
            <ContributionForm
              accounts={investments.map((investment) => ({
                id: investment.account.id,
                name: investment.account.name,
                currency: investment.account.currency,
              }))}
            />
          </div>

          {contributions.length === 0 ? (
            <p className="mt-3 text-sm text-ink-secondary">{tInv("contributionsEmpty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {contributions.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface-1 px-3.5 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate text-ink-secondary">
                    {formatDate(row.date, locale)} · {row.account}
                  </span>
                  <span className="tabular shrink-0 font-bold text-ink">
                    {formatMoney(
                      row.kind === "withdrawal" ? -row.amount : row.amount,
                      row.currency,
                      locale,
                      { compact: true },
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
