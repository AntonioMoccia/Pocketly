import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listAccounts } from "@/server/accounts";
import { accountConsistency, listEnvelopes } from "@/server/envelopes";
import { ratesForDate } from "@/server/fx";
import { buildAccountTree, ownBalanceInBase, totalWithChildren } from "@/lib/networth";
import { formatMoney } from "@/lib/money";
import { daysBetween, formatDate, today } from "@/lib/date";
import {
  Alert,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  pocketTone,
} from "@/components/ui";
import { BalancesPanel } from "./balances-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conti e Pocket" };

const STALE_DAYS = 35;

export default async function AccountsPage() {
  const context = await requireContext();
  const t = await getTranslations("accounts");
  const { household, locale } = context;
  const now = today();

  const [accounts, envelopes, rates, checks] = await Promise.all([
    listAccounts(household.id),
    listEnvelopes(household.id),
    ratesForDate(now),
    accountConsistency(household.id),
  ]);

  // Buste che promettono piu di quanto il conto contiene: di solito e una
  // spesa non ancora importata, e va fatto notare invece che nascosto.
  const inconsistent = checks.filter((check) => check.overAssigned);

  const roots = buildAccountTree(accounts);
  const byAccount = new Map(accounts.map((account) => [account.id, account]));

  // I conti si raggruppano per istituto, come nel disegno: una scheda per
  // banca, con dentro i conti e i loro Pocket.
  const groups = new Map<
    string,
    { name: string; accounts: typeof roots; lastUpdate: string | null }
  >();

  for (const root of roots) {
    const account = byAccount.get(root.id)!;
    const key = account.institutionId ?? "__none__";
    const group = groups.get(key) ?? {
      name: account.institutionName ?? t("noInstitution"),
      accounts: [],
      lastUpdate: null,
    };
    group.accounts.push(root);
    if (account.balanceDate && (!group.lastUpdate || account.balanceDate > group.lastUpdate)) {
      group.lastUpdate = account.balanceDate;
    }
    groups.set(key, group);
  }

  const stale = accounts.filter(
    (account) => !account.balanceDate || daysBetween(account.balanceDate, now) > STALE_DAYS,
  );

  const pocketCount = accounts.filter((account) => account.parentId).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("summary", { institutions: groups.size, accounts: accounts.length })}
        title={t("title")}
        actions={
          <>
            <LinkButton href="/accounts/new" variant="secondary">
              {t("new")}
            </LinkButton>
            <LinkButton href="/accounts/balances" className="lg:hidden">
              {t("updateBalances")}
            </LinkButton>
          </>
        }
      />

      {inconsistent.length > 0 ? (
        <Alert tone="warning" title={t("inconsistentTitle", { count: inconsistent.length })}>
          {inconsistent
            .map((check) =>
              t("inconsistentDetail", {
                account: check.accountName,
                envelopes: formatMoney(check.envelopesCents, check.currency, locale, { compact: true }),
                balance: formatMoney(check.balanceCents, check.currency, locale, { compact: true }),
              }),
            )
            .join(" · ")}
        </Alert>
      ) : null}

      {stale.length > 0 ? (
        <Alert tone="warning" title={t("staleTitle", { count: stale.length })}>
          {t("staleDesc", { days: STALE_DAYS })}
        </Alert>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          title={t("empty")}
          description={t("emptyDesc")}
          action={<LinkButton href="/accounts/new">{t("new")}</LinkButton>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-start">
          <div className="space-y-4">
            {[...groups.entries()].map(([key, group]) => {
              const total = group.accounts.reduce(
                (sum, root) => sum + totalWithChildren(accounts, root.id, household.baseCurrency, rates),
                0,
              );
              return (
                <Card key={key} className="p-5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2 font-bold text-ink-secondary">
                        {group.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">{group.name}</p>
                        <p className="text-xs text-ink-muted">
                          {group.lastUpdate
                            ? t("updatedOn", { date: formatDate(group.lastUpdate, locale) })
                            : t("neverUpdated")}
                        </p>
                      </div>
                    </div>
                    <p className="tabular shrink-0 text-xl font-extrabold text-ink">
                      {formatMoney(total, household.baseCurrency, locale, { compact: true })}
                    </p>
                  </header>

                  <ul className="mt-4 space-y-3">
                    {group.accounts.map((root) => {
                      const account = byAccount.get(root.id)!;
                      const inBase = ownBalanceInBase(account, household.baseCurrency, rates);
                      return (
                        <li key={root.id}>
                          <Link
                            href={`/accounts/${root.id}`}
                            className="flex items-baseline justify-between gap-3 rounded-xl px-1 py-1 hover:bg-surface-2"
                          >
                            <span className="min-w-0 truncate text-ink">{account.name}</span>
                            <span className="tabular shrink-0 font-semibold text-ink">
                              {formatMoney(account.balanceCents, account.currency, locale, {
                                compact: true,
                              })}
                              {account.currency !== household.baseCurrency && inBase !== null ? (
                                <span className="ml-1.5 text-xs font-normal text-ink-muted">
                                  ≈ {formatMoney(inBase, household.baseCurrency, locale, { compact: true })}
                                </span>
                              ) : null}
                            </span>
                          </Link>

                          {root.children.length > 0 ? (
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {root.children.map((child, index) => {
                                const pocket = byAccount.get(child.id)!;
                                return (
                                  <li key={child.id}>
                                    <Link
                                      href={`/accounts/${child.id}`}
                                      className={`flex items-center gap-3 rounded-chip px-3.5 py-2.5 ${pocketTone(index)}`}
                                    >
                                      <span className="text-sm font-medium">{pocket.name}</span>
                                      <span className="tabular text-sm font-bold">
                                        {formatMoney(pocket.balanceCents, pocket.currency, locale, {
                                          compact: true,
                                        })}
                                      </span>
                                    </Link>
                                  </li>
                                );
                              })}
                              <li>
                                <Link
                                  href={`/accounts/new?parent=${root.id}`}
                                  className="flex items-center rounded-chip border border-dashed border-border-strong px-3.5 py-2.5 text-sm text-ink-muted hover:text-ink"
                                >
                                  + {t("pocket")}
                                </Link>
                              </li>
                            </ul>
                          ) : (
                            <Link
                              href={`/accounts/new?parent=${root.id}`}
                              className="mt-1 inline-flex rounded-chip border border-dashed border-border-strong px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
                            >
                              + {t("pocket")}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}

            <p className="text-sm text-ink-muted">{t("pocketsNote", { count: pocketCount })}</p>
          </div>

          <div className="hidden lg:block">
            <BalancesPanel
              accounts={accounts.map((account) => ({
                id: account.id,
                name: account.name,
                currency: account.currency,
                balanceCents: account.balanceCents,
                balanceDate: account.balanceDate,
                institutionName: account.institutionName,
                parentName: account.parentId
                  ? (byAccount.get(account.parentId)?.name ?? null)
                  : null,
              }))}
              locale={locale}
              today={now}
            />
          </div>
        </div>
      )}

      {envelopes.length > 0 ? (
        <p className="text-xs text-ink-muted">
          {t("envelopesNote", { count: envelopes.length })}
        </p>
      ) : null}
    </div>
  );
}
