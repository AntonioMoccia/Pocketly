import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { getPayday } from "@/server/payday";
import { listEnvelopes } from "@/server/envelopes";
import { listAccounts } from "@/server/accounts";
import { formatDate, today } from "@/lib/date";
import { PaydayWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function PaydayDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const context = await requireContext();
  const t = await getTranslations("payday");
  const { id } = await params;
  const { step } = await searchParams;

  const payday = await getPayday(context.household.id, id);
  if (!payday) notFound();

  const [envelopes, accounts] = await Promise.all([
    listEnvelopes(context.household.id),
    listAccounts(context.household.id),
  ]);

  const byId = new Map(accounts.map((account) => [account.id, account]));

  return (
    <PaydayWizard
      step={Number(step ?? "2")}
      locale={context.locale}
      today={today()}
      title={t("titleFor", {
        month: new Intl.DateTimeFormat(context.locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${payday.date}T00:00:00Z`)),
      })}
      dateLabel={formatDate(payday.date, context.locale)}
      payday={{
        id: payday.id,
        date: payday.date,
        amountCents: payday.amountCents,
        currency: payday.currency,
        accountId: payday.accountId,
        closed: payday.closedAt !== null,
        unassignedCents: payday.plan.unassignedCents,
        assignedCents: payday.plan.assignedCents,
        canClose: payday.canClose,
        lines: payday.allocations.map((line) => ({
          id: line.id,
          label: line.label,
          kind: line.kind,
          envelopeId: line.envelopeId,
          plannedCents: line.plannedCents,
          actualCents: line.actualCents,
          done: line.done,
          percentBps: line.percentBps,
          percentBasis: line.percentBasis,
          priority: line.priority,
        })),
      }}
      envelopes={envelopes.map((envelope) => ({
        id: envelope.id,
        name: envelope.name,
        kind: envelope.kind,
        color: envelope.color,
        accountId: envelope.accountId,
        accountName: envelope.accountName,
      }))}
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
        balanceCents: account.balanceCents,
        balanceDate: account.balanceDate,
        institutionName: account.institutionName,
        parentName: account.parentId ? (byId.get(account.parentId)?.name ?? null) : null,
      }))}
    />
  );
}
