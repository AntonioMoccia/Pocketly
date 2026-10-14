import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { coverageFor, envelopeTransactions, getEnvelope } from "@/data/envelopes";
import { formatMoney } from "@pocketly/domain/money";
import { formatDate, startOfMonth, today } from "@pocketly/domain/date";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { EnvelopeBar } from "@/components/charts";
import { CoverPanel } from "./cover-panel";

export const dynamic = "force-dynamic";

export default async function EnvelopePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const context = await requireContext();
  const t = await getTranslations("envelopes");
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  const month = startOfMonth(monthParam ?? today());

  const envelope = await getEnvelope(id, month);
  if (!envelope) notFound();

  const [spending, coverage] = await Promise.all([
    envelopeTransactions(id, month),
    coverageFor(id, month),
  ]);

  const currency = envelope.accountCurrency;
  const monthLabel = new Intl.DateTimeFormat(context.locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));

  return (
    <div className="space-y-5">
      <Link href="/transactions" className="text-sm font-semibold text-accent hover:underline">
        ← {t("backToTransactions")}
      </Link>

      <PageHeader
        title={envelope.name}
        actions={
          <>
            <Badge tone="neutral">
              {t(`kinds.${envelope.kind}`)} · {envelope.accountName}
            </Badge>
            <Badge tone="neutral">
              {envelope.leftoverPolicy === "sweep" ? t("policySweep") : t("policyAccumulate")}
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-ink-secondary">{t("assignedIn", { month: monthLabel })}</p>
                <p className="tabular mt-1 text-2xl font-extrabold text-ink">
                  {formatMoney(envelope.budgetedCents, currency, context.locale)}
                </p>
              </div>
              <div>
                <p className="text-sm text-ink-secondary">{t("spent")}</p>
                <p className="tabular mt-1 text-2xl font-extrabold text-ink">
                  {formatMoney(envelope.spentCents, currency, context.locale)}
                </p>
              </div>
              <div>
                <p className="text-sm text-ink-secondary">{t("available")}</p>
                <p
                  className={cn(
                    "tabular mt-1 text-2xl font-extrabold",
                    envelope.overspent ? "text-critical" : "text-ink",
                  )}
                >
                  {formatMoney(envelope.availableCents, currency, context.locale)}
                </p>
              </div>
            </div>

            <EnvelopeBar
              className="mt-4"
              spent={envelope.spentCents}
              assigned={envelope.budgetedCents}
            />

            {envelope.overspent ? (
              <p className="mt-3 text-sm font-semibold text-critical">
                {t("overspentBy", {
                  amount: formatMoney(envelope.overspentByCents, currency, context.locale),
                })}
              </p>
            ) : null}

            {envelope.carryOverCents !== 0 ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("carryOver", {
                  amount: formatMoney(envelope.carryOverCents, currency, context.locale),
                })}
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-bold text-ink">{t("spendingTitle")}</h2>
            {spending.length === 0 ? (
              <EmptyState className="mt-3" title={t("noSpending")} description={t("noSpendingDesc")} />
            ) : (
              <ul className="mt-3 space-y-1.5">
                {spending.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-chip px-3 py-2.5 odd:bg-surface-2/60"
                  >
                    <Link href={`/transactions/${row.id}`} className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{row.description}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {formatDate(row.date, context.locale)} · {row.accountName}
                      </span>
                    </Link>
                    <span className="tabular shrink-0 font-bold text-ink">
                      {formatMoney(row.amount, row.currency.trim(), context.locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {envelope.overspent ? (
          <CoverPanel
            envelope={{
              id: envelope.id,
              name: envelope.name,
              overspentByCents: envelope.overspentByCents,
              currency,
            }}
            options={coverage.options.map((option) => ({
              envelopeId: option.envelopeId,
              name: option.name,
              availableCents: option.availableCents,
              kind: option.kind,
              needsTransfer: option.needsTransfer,
              discouraged: option.discouraged,
            }))}
            locale={context.locale}
          />
        ) : (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-ink">{t("healthyTitle")}</h2>
            <p className="mt-1 text-sm text-ink-secondary">{t("healthyDesc")}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
