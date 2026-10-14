import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { accountHistory, getAccount, listAccounts, listInstitutions } from "@/data/accounts";
import { listMembers } from "@/data/household";
import { ratesForDate } from "@/data/fx";
import { totalWithChildren } from "@pocketly/domain/networth";
import { formatMoney } from "@pocketly/domain/money";
import { formatDate, today } from "@pocketly/domain/date";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { AccountForm } from "../account-form";
import { archiveAccountAction, deleteAccountAction } from "@/app/actions/accounts";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireContext();
  const t = await getTranslations("accounts");
  const tCommon = await getTranslations("common");
  const { id } = await params;

  const account = await getAccount(id);
  if (!account) notFound();

  const [accounts, institutions, members, history, rates] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listInstitutions(),
    listMembers(),
    accountHistory(id),
    ratesForDate(today()),
  ]);

  // Un conto principale non ha saldo suo: si vede il totale dei Pocket e la
  // loro lista. Lo storico dei saldi sta sul singolo Pocket.
  const isContainer = !account.parentId;
  const children = accounts.filter((row) => row.parentId === id && !row.archived);
  const total = totalWithChildren(accounts, id, context.household.baseCurrency, rates);
  const parent = account.parentId ? accounts.find((row) => row.id === account.parentId) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={parent ? parent.name : (account.institutionName ?? undefined)}
        title={account.name}
        description={
          isContainer
            ? t("pocketsCount", { count: children.filter((row) => !row.isDefault).length })
            : account.isDefault
              ? t("defaultPocketHelp")
              : undefined
        }
        actions={
          account.archived ? (
            <Badge tone="warning">{tCommon("archived")}</Badge>
          ) : account.isDefault ? (
            <Badge>{t("defaultPocket")}</Badge>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-ink-secondary">
            {isContainer ? t("accountTotal") : t("ownBalance")}
          </p>
          <p className="tabular mt-1 text-2xl font-extrabold text-ink">
            {formatMoney(account.balanceCents, account.currency, context.locale)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {isContainer
              ? t("accountTotalHelp")
              : account.balanceDate
                ? t("balanceAt", { date: formatDate(account.balanceDate, context.locale) })
                : t("noBalance")}
          </p>
        </Card>

        {isContainer && account.currency !== context.household.baseCurrency ? (
          <Card className="p-5">
            <p className="text-sm text-ink-secondary">{t("accountTotalInBase")}</p>
            <p className="tabular mt-1 text-2xl font-extrabold text-ink">
              {formatMoney(total, context.household.baseCurrency, context.locale)}
            </p>
          </Card>
        ) : null}

        <Card className="p-5">
          <p className="text-sm text-ink-secondary">{t("category")}</p>
          <p className="mt-1 font-semibold text-ink">{t(`categories.${account.category}`)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {account.liquid ? t("liquidYes") : t("liquidNo")}
          </p>
        </Card>
      </div>

      {isContainer ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("pockets")}</CardTitle>
            <LinkButton href={`/accounts/new?parent=${id}`} variant="secondary">
              {t("newPocket")}
            </LinkButton>
          </CardHeader>
          <CardBody>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t("name")}</Th>
                    <Th className="text-right">{tCommon("amount")}</Th>
                    <Th>{t("updated")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((row) => (
                    <tr key={row.id}>
                      <Td>
                        <Link href={`/accounts/${row.id}`} className="font-medium text-ink hover:underline">
                          {row.name}
                        </Link>
                        {row.isDefault ? (
                          <span className="ml-2 text-xs text-ink-muted">{t("defaultPocket")}</span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-right font-semibold">
                        {formatMoney(row.balanceCents, row.currency, context.locale)}
                      </Td>
                      <Td className="text-ink-muted">
                        {row.balanceDate ? formatDate(row.balanceDate, context.locale) : t("neverUpdated")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("history")}</CardTitle>
          </CardHeader>
          <CardBody>
            {history.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("historyEmpty")}</p>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{tCommon("date")}</Th>
                      <Th className="text-right">{tCommon("amount")}</Th>
                      <Th>{t("source")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id}>
                        <Td>{formatDate(row.date, context.locale)}</Td>
                        <Td className="tabular text-right font-semibold">
                          {formatMoney(row.amount, row.currency.trim(), context.locale)}
                        </Td>
                        <Td className="text-ink-muted">{t(`sources.${row.source}`)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">{t("edit")}</h2>
        <AccountForm
          account={{
            id: account.id,
            name: account.name,
            type: account.type,
            category: account.category,
            currency: account.currency,
            liquid: account.liquid,
            parentId: account.parentId,
            isDefault: account.isDefault,
            institutionId: account.institutionId,
            note: account.note,
          }}
          parents={accounts
            .filter((row) => !row.parentId && row.id !== id)
            .map((row) => ({ id: row.id, name: row.name, currency: row.currency }))}
          institutions={institutions.map((row) => ({ id: row.id, name: row.name }))}
          members={members.map((member) => ({ id: member.userId, name: member.name }))}
          baseCurrency={context.household.baseCurrency}
          onDone="/accounts"
        />
      </section>

      {account.isDefault ? null : (
        <div className="flex flex-wrap gap-2">
          <form action={archiveAccountAction}>
            <input type="hidden" name="accountId" value={id} />
            <input type="hidden" name="archived" value={account.archived ? "false" : "true"} />
            <Button type="submit" variant="outline">
              {account.archived ? tCommon("restore") : tCommon("archive")}
            </Button>
          </form>
          <form action={deleteAccountAction}>
            <input type="hidden" name="accountId" value={id} />
            <Button type="submit" variant="ghost" className="text-critical">
              {tCommon("delete")}
            </Button>
          </form>
        </div>
      )}
      <p className="text-xs text-ink-muted">
        {account.isDefault
          ? t("defaultPocketLockedHelp")
          : isContainer
            ? t("archiveContainerHelp")
            : t("archiveHelp")}
      </p>
    </div>
  );
}
