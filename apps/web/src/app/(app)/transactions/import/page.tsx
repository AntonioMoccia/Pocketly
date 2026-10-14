import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listAccounts } from "@/data/accounts";
import { listImportBatches } from "@/data/import";
import { undoImportAction } from "@/app/actions/transactions";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@pocketly/domain/date";
import { Card, PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importa estratto conto" };

export default async function ImportPage() {
  const context = await requireContext();
  const t = await getTranslations("import");
  const tCommon = await getTranslations("common");
  const [accounts, batches] = await Promise.all([listAccounts(), listImportBatches()]);
  const names = new Map(accounts.map((account) => [account.id, account.name]));

  return (
    <div className="space-y-5">
      <Link href="/transactions" className="text-sm font-semibold text-accent hover:underline">
        ← {t("backToTransactions")}
      </Link>

      <PageHeader title={t("title")} description={t("subtitle")} />

      <ImportWizard
        // L'estratto conto e del conto: il Pocket di default non si sceglie
        // a parte, gli altri Pocket stanno sotto il nome del loro conto.
        accounts={accounts
          .filter((account) => !account.isDefault)
          .map((account) => ({
            id: account.id,
            name: account.name,
            mainAccountName: account.parentId
              ? (names.get(account.parentId) ?? account.name)
              : account.name,
            currency: account.currency,
          }))}
        locale={context.locale}
      />

      <Card className="p-5">
        <h2 className="text-lg font-bold text-ink">{t("recentTitle")}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{t("undoHint")}</p>
        {batches.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">{t("recentEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{batch.filename}</p>
                  <p className="text-xs text-ink-muted">
                    {t("recentRow", {
                      account: batch.accountName ?? "?",
                      date: formatDate(String(batch.createdAt).slice(0, 10), context.locale),
                    })}
                    {" · "}
                    {t("recentCounts", {
                      remaining: batch.remainingCount,
                      skipped: batch.skippedCount,
                    })}
                  </p>
                </div>
                <ConfirmButton
                  action={undoImportAction}
                  label={t("undo")}
                  question={t("undoQuestion")}
                  confirmLabel={t("undoConfirm")}
                  cancelLabel={tCommon("cancel")}
                >
                  <input type="hidden" name="batchId" value={batch.id} />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
