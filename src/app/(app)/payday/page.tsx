import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listIncomes, openPayday } from "@/server/payday";
import { listTemplates } from "@/server/templates";
import { listAccounts } from "@/server/accounts";
import { formatMoney } from "@/lib/money";
import { formatDate, today } from "@/lib/date";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { StartPaydayForm } from "./start-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giorno di paga" };

export default async function PaydayPage() {
  const context = await requireContext();
  const t = await getTranslations("payday");
  const { household, locale } = context;

  const [open, incomes, templates, accounts] = await Promise.all([
    openPayday(household.id),
    listIncomes(household.id),
    listTemplates(household.id),
    listAccounts(household.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("subtitle")} />

      {open ? (
        <Card tone="accent" className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-accent">{t("openNow")}</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">
            {formatMoney(open.amountCents, open.currency, locale, { compact: true })} ·{" "}
            {formatDate(open.date, locale)}
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            {t("unassignedInline", {
              amount: formatMoney(open.plan.unassignedCents, open.currency, locale, { compact: true }),
            })}
          </p>
          <LinkButton href={`/payday/${open.id}`} className="mt-4">
            {t("resume")}
          </LinkButton>
        </Card>
      ) : (
        <StartPaydayForm
          today={today()}
          baseCurrency={household.baseCurrency}
          templates={templates.map((template) => ({
            id: template.id,
            name: template.name,
            isDefault: template.isDefault,
            lineCount: template.lineCount,
          }))}
          accounts={accounts
            .filter((account) => !account.parentId)
            .map((account) => ({ id: account.id, name: account.name, currency: account.currency }))}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
          <Link href="/templates" className="text-sm font-semibold text-accent hover:underline">
            {t("manageTemplates")}
          </Link>
        </CardHeader>
        <CardBody>
          {incomes.length === 0 ? (
            <EmptyState title={t("historyEmpty")} description={t("historyEmptyDesc")} />
          ) : (
            <ul className="divide-y divide-border">
              {incomes.map((income) => (
                <li key={income.id}>
                  <Link
                    href={`/payday/${income.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{formatDate(income.date, locale)}</p>
                      <p className="text-xs text-ink-muted">
                        {t(`kinds.${income.kind}`)} ·{" "}
                        {t("linesDone", { done: income.doneCount, total: income.lineCount })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular font-bold text-ink">
                        {formatMoney(income.amount, income.currency, locale, { compact: true })}
                      </span>
                      <Badge tone={income.closedAt ? "good" : "warning"}>
                        {income.closedAt ? t("closed") : t("open")}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
