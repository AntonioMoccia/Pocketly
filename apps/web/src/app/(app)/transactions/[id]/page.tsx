import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { getTransaction, listTransactions, ruleSuggestionFor } from "@/data/transactions";
import { listCategories } from "@/data/categories";
import { listEnvelopes } from "@/data/envelopes";
import { formatDate, startOfMonth } from "@pocketly/domain/date";
import { CategorizeForm } from "./categorize-form";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireContext();
  const t = await getTranslations("transactions");
  const { id } = await params;

  const transaction = await getTransaction(id);
  if (!transaction) notFound();

  const [categories, envelopes, pending] = await Promise.all([
    listCategories(),
    listEnvelopes({ month: startOfMonth(transaction.date) }),
    listTransactions({ uncategorized: true, limit: 50 }),
  ]);

  // La regola proposta si calcola solo se la spesa non e ancora categorizzata:
  // sulle altre sarebbe rumore.
  const suggestion =
    transaction.categoryId === null && categories[0]
      ? await ruleSuggestionFor(
          transaction.id,
          categories[0].id,
          categories[0].defaultEnvelopeId,
        )
      : null;

  const queue = pending.filter((row) => row.id !== id);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link href="/transactions" className="text-sm font-semibold text-accent hover:underline">
        ← {t("title")}
      </Link>

      {queue.length > 0 ? (
        <p className="text-sm text-ink-muted">
          {t("queuePosition", { remaining: queue.length + 1 })}
        </p>
      ) : null}

      <CategorizeForm
        transaction={{
          id: transaction.id,
          description: transaction.description,
          counterparty: transaction.counterparty,
          amount: transaction.amount,
          currency: transaction.currency,
          date: transaction.date,
          dateLabel: formatDate(transaction.date, context.locale, "long"),
          accountName: transaction.accountName,
          categoryId: transaction.categoryId,
          envelopeId: transaction.envelopeId,
          ignored: transaction.ignored,
          isTransfer: transaction.transferGroupId !== null,
        }}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          kind: category.kind,
          defaultEnvelopeId: category.defaultEnvelopeId,
        }))}
        envelopes={envelopes.map((envelope) => ({
          id: envelope.id,
          name: envelope.name,
          kind: envelope.kind,
          accountName: envelope.accountName,
          mainAccountName: envelope.mainAccountName,
          color: envelope.color,
          availableCents: envelope.availableCents,
        }))}
        suggestion={suggestion ? { value: suggestion.rule.value, wouldMatch: suggestion.wouldMatch } : null}
        locale={context.locale}
        nextId={queue[0]?.id ?? null}
      />
    </div>
  );
}
