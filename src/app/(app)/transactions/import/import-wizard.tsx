"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { commitImportAction, previewImportAction } from "@/app/actions/transactions";
import { idleState, type ActionState } from "@/lib/action-state";
import { Button, Card, Field, Input, Select, Table, TableWrap, Td, Th, cn } from "@/components/ui";
import { formatMoney } from "@/lib/money";

type PreviewRow = {
  date: string;
  description: string;
  amountCents: number;
  currency: string | null;
  duplicate: boolean;
  categoryId: string | null;
};

type Preview = {
  headers: string[];
  delimiter: string;
  columnMap: Record<string, string | undefined>;
  rows: PreviewRow[];
  errors: { line: number; reason: string }[];
  counts: {
    total: number;
    duplicates: number;
    fresh: number;
    categorized: number;
    uncategorized: number;
  };
};

type PreviewState = ActionState & {
  preview?: unknown;
  filename?: string;
  accountId?: string;
};

/**
 * Import in due tempi: l'anteprima non scrive nulla, la conferma scrive. Chi
 * importa un estratto conto deve poter vedere cosa succede prima che succeda.
 */
export function ImportWizard({
  accounts,
  locale,
}: {
  accounts: { id: string; name: string; currency: string; institutionName: string | null }[];
  locale: string;
}) {
  const t = useTranslations("import");
  const tCommon = useTranslations("common");
  const [previewState, previewAction, previewPending] = useActionState<PreviewState, FormData>(
    previewImportAction,
    idleState,
  );
  const [commitState, commitAction, commitPending] = useActionState(commitImportAction, idleState);

  const preview = previewState.preview as Preview | undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:items-start">
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-lg font-bold text-ink">{t("step1")}</h2>
          <form action={previewAction} className="mt-4 space-y-4">
            <Field label={t("account")} htmlFor="import-account" hint={t("accountHelp")}>
              <Select id="import-account" name="accountId" required defaultValue={accounts[0]?.id}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.institutionName
                      ? `${account.institutionName} · ${account.name}`
                      : account.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t("file")} htmlFor="import-file" hint={t("fileHelp")}>
              <Input
                id="import-file"
                name="file"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                required
                className="h-auto py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
              />
            </Field>

            <details className="rounded-field border border-border p-3.5">
              <summary className="cursor-pointer text-sm font-medium text-ink-secondary">
                {t("advanced")}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t("delimiter")} htmlFor="import-delimiter" hint={t("delimiterHelp")}>
                  <Select id="import-delimiter" name="delimiter" defaultValue="">
                    <option value="">{t("auto")}</option>
                    <option value=",">,</option>
                    <option value=";">;</option>
                    <option value="\t">Tab</option>
                  </Select>
                </Field>
                <Field label={t("dateFormat")} htmlFor="import-date-format">
                  <Select id="import-date-format" name="dateFormat" defaultValue="">
                    <option value="">{t("auto")}</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  </Select>
                </Field>
              </div>
            </details>

            {previewState.status === "error" ? (
              <p className="text-sm font-medium text-critical" role="alert">
                {previewState.messageKey === "import.columnsMissing"
                  ? t("columnsMissing")
                  : previewState.messageKey === "import.tooLarge"
                    ? t("tooLarge")
                    : previewState.messageKey === "import.noFile"
                      ? t("noFile")
                      : tCommon("error")}
              </p>
            ) : null}

            <Button type="submit" disabled={previewPending}>
              {previewPending ? t("reading") : t("readFile")}
            </Button>
          </form>
        </Card>

        {preview ? (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-ink">{t("step2")}</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              {t("columnsRecognised", {
                date: preview.columnMap.date ?? "?",
                description: preview.columnMap.description ?? "?",
                amount: preview.columnMap.amount ?? preview.columnMap.debit ?? "?",
              })}
            </p>

            <TableWrap className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>{tCommon("date")}</Th>
                    <Th>{tCommon("name")}</Th>
                    <Th className="text-right">{tCommon("amount")}</Th>
                    <Th>{tCommon("status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 12).map((row, index) => (
                    <tr key={index} className="border-t border-border">
                      <Td className="whitespace-nowrap">{row.date}</Td>
                      <Td className="max-w-56 truncate">{row.description}</Td>
                      <Td className="tabular text-right font-semibold">
                        {formatMoney(row.amountCents, row.currency ?? "EUR", locale)}
                      </Td>
                      <Td
                        className={cn(
                          "text-xs",
                          row.duplicate
                            ? "text-ink-muted"
                            : row.categoryId
                              ? "text-good"
                              : "text-accent",
                        )}
                      >
                        {row.duplicate
                          ? t("rowDuplicate")
                          : row.categoryId
                            ? t("rowCategorized")
                            : t("rowToCategorize")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            {preview.rows.length > 12 ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("moreRows", { count: preview.rows.length - 12 })}
              </p>
            ) : null}

            {preview.errors.length > 0 ? (
              <p className="mt-3 text-sm text-warning">
                {t("rowErrors", { count: preview.errors.length })}
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>

      {preview ? (
        <Card tone="accent" className="p-5 lg:sticky lg:top-20">
          <h2 className="text-lg font-bold text-ink">{t("summary")}</h2>

          <dl className="mt-3 space-y-2 text-sm">
            <Row label={t("rowsInFile")} value={preview.counts.total} />
            <Row label={t("alreadyImported")} value={preview.counts.duplicates} muted />
            <div className="border-t border-border pt-2">
              <Row label={t("newTransactions")} value={preview.counts.fresh} strong />
            </div>
            <Row label={t("categorizedByRules")} value={preview.counts.categorized} indent />
            <Row label={t("toCategorize")} value={preview.counts.uncategorized} indent />
          </dl>

          {preview.counts.fresh > 0 ? (
            <p className="mt-3 rounded-2xl bg-surface-1 p-3 text-sm text-ink-secondary">
              {t("ratePreview", {
                percent: Math.round(
                  (preview.counts.categorized / Math.max(1, preview.counts.fresh)) * 100,
                ),
              })}
            </p>
          ) : null}

          <form action={commitAction} className="mt-4">
            <input type="hidden" name="accountId" value={previewState.accountId ?? ""} />
            <input type="hidden" name="filename" value={previewState.filename ?? "estratto.csv"} />
            <input type="hidden" name="preview" value={JSON.stringify(preview)} />

            {commitState.status === "error" ? (
              <p className="mb-2 text-sm font-medium text-critical" role="alert">
                {tCommon("error")}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={commitPending || preview.counts.fresh === 0}
            >
              {commitPending
                ? t("importing")
                : preview.counts.fresh === 0
                  ? t("nothingNew")
                  : t("importCount", { count: preview.counts.fresh })}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  indent,
}: {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-3", indent && "pl-3")}>
      <dt className={cn(muted ? "text-ink-muted" : "text-ink-secondary")}>{label}</dt>
      <dd className={cn("tabular", strong ? "font-bold text-ink" : "font-semibold text-ink-secondary")}>
        {value}
      </dd>
    </div>
  );
}
