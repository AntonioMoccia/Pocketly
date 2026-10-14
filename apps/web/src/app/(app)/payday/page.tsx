import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listIncomes, openPayday } from "@/data/payday";
import { listTemplates } from "@/data/templates";
import { listAccounts } from "@/data/accounts";
import { getTransaction } from "@/data/transactions";
import { formatMoney, toMajor } from "@pocketly/domain/money";
import { formatDate, today } from "@pocketly/domain/date";
import { guessIncomeKind } from "@pocketly/domain/income";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  Select,
} from "@/components/ui";
import { StartPaydayForm, type StartPrefill } from "./start-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrate" };

export default async function PaydayPage({
  searchParams,
}: {
  /**
   * `transaction`: ripartisci un movimento in entrata importato.
   * `pocket`: ripartisci il saldo accumulato in un Pocket.
   * `split`: conferma di una ripartizione rapida appena chiusa.
   */
  searchParams: Promise<{ transaction?: string; pocket?: string; split?: string }>;
}) {
  const context = await requireContext();
  const t = await getTranslations("payday");
  const { household, locale } = context;
  const query = await searchParams;

  const [open, incomes, templates, accounts, transaction] = await Promise.all([
    openPayday(),
    listIncomes(),
    listTemplates(),
    listAccounts(),
    query.transaction ? getTransaction(query.transaction) : Promise.resolve(null),
  ]);

  // Un movimento gia ripartito porta alla sua ripartizione, non a un doppione.
  if (transaction?.incomeEventId) redirect(`/payday/${transaction.incomeEventId}`);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const pocket = query.pocket ? accountById.get(query.pocket) : undefined;

  let prefill: StartPrefill | undefined;
  if (transaction && transaction.amount > 0) {
    prefill = {
      amount: String(toMajor(transaction.amount, transaction.currency)),
      date: transaction.date,
      accountId: transaction.accountId,
      kind: guessIncomeKind(transaction.categoryName),
      note: transaction.description.slice(0, 200),
      transactionId: transaction.id,
    };
  } else if (pocket && pocket.balanceCents > 0) {
    prefill = {
      amount: String(toMajor(pocket.balanceCents, pocket.currency)),
      date: today(),
      accountId: pocket.id,
      kind: "other",
      note: t("fromPocketNote", { name: pocket.name }),
      transactionId: null,
    };
  }

  const mainName = (account: (typeof accounts)[number]) =>
    account.parentId ? (accountById.get(account.parentId)?.name ?? account.name) : account.name;

  // Pocket dove si accumulano le entrate piccole: quelli con un saldo, tolti
  // i Principali, che sono il conto stesso.
  const pockets = accounts.filter(
    (account) => account.parentId && !account.isDefault && account.balanceCents > 0,
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("subtitle")} />

      {query.split ? (
        <Alert
          tone="good"
          title={t("quickDone")}
          action={
            <LinkButton href={`/payday/${query.split}`} variant="secondary" size="sm">
              {t("quickDoneOpen")}
            </LinkButton>
          }
        >
          {t("quickDoneDesc")}
        </Alert>
      ) : null}

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
      ) : null}

      <div id="start">
        <StartPaydayForm
          // Cambiando origine il modulo riparte dai nuovi valori.
          key={query.transaction ?? query.pocket ?? "new"}
          today={today()}
          baseCurrency={household.baseCurrency}
          prefill={prefill}
          templates={templates.map((template) => ({
            id: template.id,
            name: template.name,
            isDefault: template.isDefault,
            incomeKind: template.incomeKind,
            lineCount: template.lineCount,
          }))}
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            mainAccountName: mainName(account),
          }))}
        />
      </div>

      {pockets.length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("accumulate")}</CardTitle>
              <CardDescription>{t("accumulateDesc")}</CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            <form action="/payday#start" method="get" className="flex flex-wrap items-end gap-2">
              <Select
                name="pocket"
                defaultValue={pocket?.id ?? pockets[0]?.id}
                aria-label={t("accumulatePocket")}
                className="w-auto min-w-56 flex-1"
              >
                {pockets.map((account) => (
                  <option key={account.id} value={account.id}>
                    {mainName(account)} · {account.name} —{" "}
                    {formatMoney(account.balanceCents, account.currency, locale)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                {t("accumulateSplit")}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

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
                      <p className="truncate text-xs text-ink-muted">
                        {t(`kinds.${income.kind}`)} ·{" "}
                        {t("linesDone", { done: income.doneCount, total: income.lineCount })}
                        {income.note ? ` · ${income.note}` : ""}
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
