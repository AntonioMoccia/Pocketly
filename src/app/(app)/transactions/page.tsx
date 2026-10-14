import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import {
  categorizationRate,
  listTransactions,
  listTransferTodos,
  uncategorizedCount,
} from "@/server/transactions";
import { listEnvelopes } from "@/server/envelopes";
import { listAccounts } from "@/server/accounts";
import { formatMoney } from "@/lib/money";
import { formatDate, startOfMonth, today } from "@/lib/date";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  cn,
  pocketDot,
} from "@/components/ui";
import { EnvelopeBar } from "@/components/charts";
import { settleTransferAction } from "@/app/actions/transactions";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movimenti" };

type Filter = "all" | "uncategorized" | "income" | "expense" | "transfer";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; month?: string; account?: string; envelope?: string }>;
}) {
  const context = await requireContext();
  const t = await getTranslations("transactions");
  const { household, locale } = context;
  const query = await searchParams;

  const month = query.month ?? startOfMonth(today());
  const filter = (query.filter ?? "all") as Filter;

  const [rows, envelopes, accounts, todos, pending, rate] = await Promise.all([
    listTransactions(household.id, {
      month,
      accountId: query.account,
      envelopeId: query.envelope,
      uncategorized: filter === "uncategorized" ? true : undefined,
      kind:
        filter === "income" || filter === "expense" || filter === "transfer" ? filter : undefined,
    }),
    listEnvelopes(household.id, { month }),
    listAccounts(household.id),
    listTransferTodos(household.id),
    uncategorizedCount(household.id, month),
    categorizationRate(household.id, month),
  ]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));

  // I movimenti si leggono per giorno, come un estratto conto.
  const byDay = new Map<string, typeof rows>();
  for (const row of rows) {
    byDay.set(row.date, [...(byDay.get(row.date) ?? []), row]);
  }

  const overspent = envelopes.filter((envelope) => envelope.overspent);
  const filters: Filter[] = ["all", "uncategorized", "income", "expense", "transfer"];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("eyebrow", { month: monthLabel, count: rows.length })}
        title={t("title")}
        actions={<LinkButton href="/transactions/import">{t("import")}</LinkButton>}
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((value) => {
          const active = filter === value;
          const href = value === "all" ? "/transactions" : `/transactions?filter=${value}`;
          return (
            <Link
              key={value}
              href={href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-ink text-surface-1"
                  : value === "uncategorized" && pending > 0
                    ? "bg-accent-soft text-accent-ink"
                    : "bg-surface-1 text-ink-secondary hover:text-ink",
              )}
            >
              {t(`filters.${value}`)}
              {value === "uncategorized" && pending > 0 ? ` · ${pending}` : null}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        <Card className="p-5">
          {rows.length === 0 ? (
            <EmptyState
              title={t("empty")}
              description={t("emptyDesc")}
              action={<LinkButton href="/transactions/import">{t("import")}</LinkButton>}
            />
          ) : (
            <div className="space-y-5">
              {[...byDay.entries()].map(([date, items]) => (
                <section key={date}>
                  <h2 className="mb-2 text-sm font-semibold text-ink-muted">
                    {formatDate(date, locale, "long")}
                  </h2>
                  <ul className="space-y-1.5">
                    {items.map((row) => (
                      <li key={row.id}>
                        <Link
                          href={`/transactions/${row.id}`}
                          className={cn(
                            "flex items-center gap-3 rounded-chip px-3 py-2.5 transition-colors hover:bg-surface-2",
                            row.kind === "income" && !row.transferGroupId ? "bg-good-soft/60" : null,
                            !row.categoryId && row.kind !== "transfer"
                              ? "border border-dashed border-accent/50"
                              : null,
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                              row.transferGroupId
                                ? "bg-surface-2 text-ink-muted"
                                : row.kind === "income"
                                  ? "bg-good-soft text-good"
                                  : "bg-surface-2 text-ink-secondary",
                            )}
                            aria-hidden="true"
                          >
                            {row.transferGroupId ? "⇄" : row.description.slice(0, 1).toUpperCase()}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-ink">
                              {row.description}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {row.transferGroupId
                                ? t("transferExcluded")
                                : row.categoryName
                                  ? `${row.categoryName}${row.envelopeName ? ` · ${row.envelopeName}` : ""}`
                                  : t("toCategorize")}
                            </span>
                          </span>

                          {row.envelopeName && !row.transferGroupId ? (
                            <span className="hidden items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary sm:flex">
                              <span
                                aria-hidden="true"
                                className={cn("size-2 rounded-full", pocketDot(row.envelopeColor ?? 0))}
                              />
                              {row.envelopeName}
                            </span>
                          ) : null}

                          <span
                            className={cn(
                              "tabular shrink-0 font-bold",
                              row.transferGroupId
                                ? "text-ink-muted"
                                : row.amount > 0
                                  ? "text-good"
                                  : "text-ink",
                            )}
                          >
                            {formatMoney(row.amount, row.currency, locale, { showSign: row.amount > 0 })}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20">
          <Card className="p-5">
            <h2 className="text-lg font-bold text-ink">{t("envelopesTitle", { month: monthLabel })}</h2>

            {envelopes.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">{t("noEnvelopes")}</p>
            ) : (
              <ul className="mt-3 space-y-3.5">
                {[...envelopes]
                  .sort((a, b) => Number(b.overspent) - Number(a.overspent))
                  .slice(0, 6)
                  .map((envelope) => (
                    <li key={envelope.id}>
                      <Link href={`/envelopes/${envelope.id}`} className="block">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-semibold text-ink">
                            {envelope.name}
                            <span className="ml-1.5 text-xs font-normal text-ink-muted">
                              {t(`kinds.${envelope.kind}`)}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "tabular shrink-0 font-bold",
                              envelope.overspent ? "text-critical" : "text-ink",
                            )}
                          >
                            {formatMoney(envelope.availableCents, context.household.baseCurrency, locale)}
                          </span>
                        </div>
                        <EnvelopeBar
                          className="mt-1.5"
                          spent={envelope.spentCents}
                          assigned={envelope.budgetedCents}
                        />
                        <p className="mt-1 text-xs text-ink-muted">
                          {t("spentOf", {
                            spent: formatMoney(envelope.spentCents, context.household.baseCurrency, locale, {
                              compact: true,
                            }),
                            assigned: formatMoney(
                              envelope.budgetedCents,
                              context.household.baseCurrency,
                              locale,
                              { compact: true },
                            ),
                          })}
                        </p>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}

            {envelopes.length > 6 ? (
              <p className="mt-3 text-xs text-ink-muted">
                {t("moreEnvelopes", {
                  names: envelopes
                    .slice(6)
                    .map((envelope) => envelope.name)
                    .join(", "),
                })}
              </p>
            ) : null}
          </Card>

          {overspent.length > 0 ? (
            <Alert
              tone="critical"
              title={t("overspentTitle", { count: overspent.length })}
              action={
                <LinkButton href={`/envelopes/${overspent[0]!.id}`} size="sm" variant="secondary">
                  {t("coverNow")}
                </LinkButton>
              }
            />
          ) : null}

          {todos.length > 0 ? (
            <Card tone="warning" className="p-5">
              <h2 className="font-bold text-ink">{t("transfersTodo", { count: todos.length })}</h2>
              <ul className="mt-3 space-y-2">
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-surface-1 px-3.5 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink-secondary">
                      {todo.fromAccountName} → {todo.toAccountName}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular font-bold text-ink">
                        {formatMoney(todo.amount, todo.currency.trim(), locale, { compact: true })}
                      </span>
                      <form action={settleTransferAction}>
                        <input type="hidden" name="todoId" value={todo.id} />
                        <input type="hidden" name="done" value="true" />
                        <Button type="submit" variant="ghost" size="sm">
                          ✓
                        </Button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-secondary">{t("transfersAutoNote")}</p>
            </Card>
          ) : null}

          {rate.total > 0 ? (
            <Card className="p-5">
              <p className="text-sm text-ink-secondary">{t("categorizationRate")}</p>
              <p className="tabular mt-1 text-2xl font-extrabold text-ink">
                {new Intl.NumberFormat(locale, { style: "percent" }).format(rate.ratio)}
              </p>
              <Badge tone={rate.ratio >= 0.8 ? "good" : "warning"} className="mt-2">
                {rate.ratio >= 0.8 ? t("rateGood") : t("rateLow")}
              </Badge>
            </Card>
          ) : null}
        </div>
      </div>

      {accounts.length === 0 ? null : (
        <p className="text-xs text-ink-muted">{t("accountsHint", { count: accounts.length })}</p>
      )}
    </div>
  );
}
