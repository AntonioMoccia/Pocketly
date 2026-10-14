"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { commitNotionAction, previewNotionAction } from "@/app/actions/notion";
import { idleState, type ActionState } from "@/lib/action-state";
import { Alert, Button, Card, Field, Input, Select, Table, TableWrap, Td, Th } from "@/components/ui";
import { formatMoney } from "@/lib/money";

type AccountRow = {
  name: string;
  institution: string | null;
  parent: string | null;
  currency: string;
  category: string;
  balanceCents: number | null;
  duplicate: boolean;
};

type ContributionRow = {
  accountName: string;
  date: string;
  amountCents: number;
  kind: "deposit" | "withdrawal";
  unknownAccount: boolean;
};

type Preview =
  | { kind: "accounts"; rows: AccountRow[]; errors: string[] }
  | { kind: "contributions"; rows: ContributionRow[]; errors: string[] };

type PreviewState = ActionState & { preview?: unknown };

/**
 * Import da Notion in due tempi, come quello degli estratti conto: prima si
 * guarda cosa entrerebbe, poi si conferma. Le righe gia presenti si vedono
 * marcate, cosi ripetere l'import non crea doppioni.
 */
export function NotionImport({ locale, baseCurrency }: { locale: string; baseCurrency: string }) {
  const t = useTranslations("notion");
  const tCommon = useTranslations("common");
  const [previewState, previewAction, previewPending] = useActionState<PreviewState, FormData>(
    previewNotionAction,
    idleState,
  );
  const [commitState, commitAction, commitPending] = useActionState(commitNotionAction, idleState);

  const preview = previewState.preview as Preview | undefined;
  const importable =
    preview?.kind === "accounts"
      ? preview.rows.filter((row) => !row.duplicate).length
      : (preview?.rows.filter((row) => !row.unknownAccount).length ?? 0);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form action={previewAction} className="space-y-4">
          <Field label={t("what")} htmlFor="notion-kind" hint={t("whatHelp")}>
            <Select id="notion-kind" name="kind" defaultValue="accounts">
              <option value="accounts">{t("kinds.accounts")}</option>
              <option value="contributions">{t("kinds.contributions")}</option>
            </Select>
          </Field>

          <Field label={t("file")} htmlFor="notion-file" hint={t("fileHelp")}>
            <Input
              id="notion-file"
              name="file"
              type="file"
              accept=".csv,text/csv,text/plain"
              required
              className="h-auto py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
            />
          </Field>

          {previewState.status === "error" ? (
            <p className="text-sm font-medium text-critical" role="alert">
              {previewState.messageKey === "notion.columnsMissing"
                ? t("columnsMissing")
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
          <h2 className="text-lg font-bold text-ink">{t("preview")}</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {t("previewCount", { total: preview.rows.length, importable })}
          </p>

          {preview.errors.length > 0 ? (
            <Alert tone="warning" className="mt-3">
              {preview.errors.slice(0, 3).join(" · ")}
            </Alert>
          ) : null}

          <TableWrap className="mt-4">
            <Table>
              {preview.kind === "accounts" ? (
                <>
                  <thead>
                    <tr>
                      <Th>{tCommon("name")}</Th>
                      <Th>{t("institution")}</Th>
                      <Th>{t("parent")}</Th>
                      <Th className="text-right">{t("balance")}</Th>
                      <Th>{tCommon("status")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 20).map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        <Td className="font-semibold text-ink">{row.name}</Td>
                        <Td className="text-ink-secondary">{row.institution ?? "—"}</Td>
                        <Td className="text-ink-secondary">{row.parent ?? "—"}</Td>
                        <Td className="tabular text-right">
                          {row.balanceCents === null
                            ? "—"
                            : formatMoney(row.balanceCents, row.currency, locale, { compact: true })}
                        </Td>
                        <Td className={row.duplicate ? "text-ink-muted" : "text-good"}>
                          {row.duplicate ? t("rowExists") : t("rowNew")}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <Th>{t("account")}</Th>
                      <Th>{tCommon("date")}</Th>
                      <Th className="text-right">{tCommon("amount")}</Th>
                      <Th>{tCommon("status")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 20).map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        <Td className="font-semibold text-ink">{row.accountName}</Td>
                        <Td>{row.date}</Td>
                        <Td className="tabular text-right">
                          {formatMoney(
                            row.kind === "withdrawal" ? -row.amountCents : row.amountCents,
                            baseCurrency,
                            locale,
                            { compact: true },
                          )}
                        </Td>
                        <Td className={row.unknownAccount ? "text-critical" : "text-good"}>
                          {row.unknownAccount ? t("rowNoAccount") : t("rowNew")}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </Table>
          </TableWrap>

          {preview.rows.length > 20 ? (
            <p className="mt-2 text-xs text-ink-muted">
              {t("moreRows", { count: preview.rows.length - 20 })}
            </p>
          ) : null}

          <form action={commitAction} className="mt-4">
            <input type="hidden" name="preview" value={JSON.stringify(preview)} />

            {commitState.status === "success" ? (
              <p className="mb-2 text-sm font-medium text-good" role="status">
                {t("done", {
                  created: Number(commitState.messageValues?.created ?? 0),
                  skipped: Number(commitState.messageValues?.skipped ?? 0),
                })}
              </p>
            ) : null}
            {commitState.status === "error" ? (
              <p className="mb-2 text-sm font-medium text-critical" role="alert">
                {tCommon("error")}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={commitPending || importable === 0}>
              {commitPending
                ? t("importing")
                : importable === 0
                  ? t("nothingNew")
                  : t("importCount", { count: importable })}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
