import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { accountHistory, getAccount, listAccounts, listInstitutions } from "@/server/accounts";
import { listMembers } from "@/server/household";
import { ratesForDate } from "@/server/fx";
import { totalWithChildren } from "@/lib/networth";
import { formatMoney } from "@/lib/money";
import { formatDate, today } from "@/lib/date";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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

  const account = await getAccount(context.household.id, id);
  if (!account) notFound();

  const [accounts, institutions, members, history, rates] = await Promise.all([
    listAccounts(context.household.id, { includeArchived: true }),
    listInstitutions(context.household.id),
    listMembers(context.household.id),
    accountHistory(context.household.id, id),
    ratesForDate(today()),
  ]);

  const children = accounts.filter((row) => row.parentId === id);
  const withChildren = totalWithChildren(accounts, id, context.household.baseCurrency, rates);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={account.institutionName ?? undefined}
        title={account.name}
        description={t("pocketsCount", { count: children.length })}
        actions={account.archived ? <Badge tone="warning">{tCommon("archived")}</Badge> : null}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-ink-secondary">{t("ownBalance")}</p>
          <p className="tabular mt-1 text-2xl font-extrabold text-ink">
            {formatMoney(account.balanceCents, account.currency, context.locale)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {account.balanceDate
              ? t("balanceAt", { date: formatDate(account.balanceDate, context.locale) })
              : t("noBalance")}
          </p>
        </Card>

        {children.length > 0 ? (
          <Card className="p-5">
            <p className="text-sm text-ink-secondary">{t("totalWithPockets")}</p>
            <p className="tabular mt-1 text-2xl font-extrabold text-ink">
              {formatMoney(withChildren, context.household.baseCurrency, context.locale)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{t("totalWithPocketsHelp")}</p>
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
      <p className="text-xs text-ink-muted">{t("archiveHelp")}</p>
    </div>
  );
}
