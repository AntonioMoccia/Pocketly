"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { saveTemplateAction } from "@/app/actions/misc";
import { idleState } from "@/lib/action-state";
import {
  AmountInput,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  cn,
  pocketDot,
} from "@/components/ui";
import { GroupedPicker } from "@/components/grouped-picker";
import { computeAllocation, validateTemplate, type AllocationLineInput } from "@pocketly/domain/allocation";
import { formatMoney, parseAmountToCents, toMajor } from "@pocketly/domain/money";

type EnvelopeOption = { id: string; name: string; mainAccountName: string; color: number };

export type TemplateData = {
  id: string;
  name: string;
  isDefault: boolean;
  lines: AllocationLineInput[];
};

/**
 * Editor di un modello con prova dal vivo: si scrive un importo e si vede come
 * si dividerebbe. Un modello si capisce guardandolo applicato, non leggendolo.
 */
export function TemplateEditor({
  template,
  envelopes,
  baseCurrency,
  locale,
  inline = false,
}: {
  template?: TemplateData;
  envelopes: EnvelopeOption[];
  baseCurrency: string;
  locale: string;
  inline?: boolean;
}) {
  const t = useTranslations("templates");
  const tPayday = useTranslations("payday");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(inline);
  const [state, action, pending] = useActionState(saveTemplateAction, idleState);

  const [lines, setLines] = useState<AllocationLineInput[]>(
    template?.lines ?? [
      {
        id: crypto.randomUUID(),
        label: "",
        kind: "fixed",
        envelopeId: envelopes[0]?.id ?? null,
        amountCents: 0,
        percentBps: 0,
        percentBasis: "gross",
        priority: 1,
      },
    ],
  );
  const [preview, setPreview] = useState("");

  const previewCents = parseAmountToCents(preview, baseCurrency) ?? 0;
  const plan = useMemo(() => computeAllocation(previewCents, lines), [previewCents, lines]);
  const issues = useMemo(() => validateTemplate(lines), [lines]);
  const errors = issues.filter((issue) => issue.level === "error");

  function update(id: string, patch: Partial<AllocationLineInput>) {
    setLines((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ {t("new")}</Button>;
  }

  const body = (
    <form action={action} className="space-y-4">
      {template ? <input type="hidden" name="templateId" value={template.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tCommon("name")} htmlFor="template-name">
          <Input
            id="template-name"
            name="name"
            required
            maxLength={60}
            defaultValue={template?.name ?? ""}
            placeholder={t("namePlaceholder")}
          />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox
            name="isDefault"
            label={t("isDefault")}
            description={t("isDefaultHelp")}
            defaultChecked={template?.isDefault}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-bold text-ink">{t("lines")}</h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setLines((rows) => [
                ...rows,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  kind: "fixed",
                  envelopeId: envelopes[0]?.id ?? null,
                  amountCents: 0,
                  percentBps: 0,
                  percentBasis: "gross",
                  priority: rows.length + 1,
                },
              ])
            }
          >
            + {tPayday("addLine")}
          </Button>
        </div>

        <ul className="space-y-2">
          {lines.map((line, index) => {
            const envelope = envelopes.find((option) => option.id === line.envelopeId);
            const planned = plan.lines.find((row) => row.id === line.id)?.plannedCents ?? 0;
            return (
              <li
                key={line.id}
                className={cn(
                  "grid gap-2 rounded-chip p-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_7rem_auto] sm:items-center",
                  line.kind === "remainder" ? "bg-good-soft" : "bg-surface-2/60",
                )}
              >
                <div className="flex items-center gap-2">
                  {envelope ? (
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 shrink-0 rounded-full", pocketDot(envelope.color))}
                    />
                  ) : null}
                  <Input
                    name={`line.${index}.label`}
                    value={line.label}
                    onChange={(event) => update(line.id, { label: event.target.value })}
                    placeholder={tPayday("lineLabelPlaceholder")}
                    className="h-10 border-transparent bg-transparent px-1 font-semibold"
                  />
                </div>

                <GroupedPicker
                  name={`line.${index}.envelopeId`}
                  value={line.envelopeId}
                  onChange={(envelopeId) => update(line.id, { envelopeId })}
                  options={envelopes}
                  placeholder={tPayday("chooseEnvelope")}
                  className="h-10 border-transparent bg-transparent text-sm"
                  aria-label={tPayday("lineDestination")}
                />

                <Select
                  name={`line.${index}.kind`}
                  value={line.kind}
                  onChange={(event) =>
                    update(line.id, { kind: event.target.value as AllocationLineInput["kind"] })
                  }
                  className="h-10 border-transparent bg-transparent text-sm"
                  aria-label={tPayday("lineKind")}
                >
                  <option value="fixed">{tPayday("kindsLine.fixed")}</option>
                  <option value="percent">{tPayday("kindsLine.percent")}</option>
                  <option value="remainder">{tPayday("kindsLine.remainder")}</option>
                </Select>

                <div className="flex items-center justify-end gap-2">
                  {line.kind === "fixed" ? (
                    <AmountInput
                      name={`line.${index}.amount`}
                      value={plain(line.amountCents, baseCurrency)}
                      onChange={(event) =>
                        update(line.id, {
                          amountCents: parseAmountToCents(event.target.value, baseCurrency) ?? 0,
                        })
                      }
                      className="h-10 w-28"
                      aria-label={tCommon("amount")}
                    />
                  ) : line.kind === "percent" ? (
                    <>
                      <Input
                        name={`line.${index}.percent`}
                        inputMode="decimal"
                        value={String(line.percentBps / 100)}
                        onChange={(event) =>
                          update(line.id, {
                            percentBps: Math.round(
                              (Number(event.target.value.replace(",", ".")) || 0) * 100,
                            ),
                          })
                        }
                        className="tabular h-10 w-20 text-right"
                        aria-label={tPayday("percent")}
                      />
                      <span className="text-sm text-ink-muted">%</span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-good">
                      {previewCents > 0
                        ? formatMoney(planned, baseCurrency, locale, { compact: true })
                        : tPayday("kindsLine.remainder")}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setLines((rows) => rows.filter((row) => row.id !== line.id))}
                    className="rounded-lg px-1.5 py-1 text-ink-muted hover:text-critical"
                    aria-label={tCommon("delete")}
                  >
                    ×
                  </button>
                </div>

                <input type="hidden" name={`line.${index}.id`} value={line.id} />
                <input type="hidden" name={`line.${index}.percentBasis`} value={line.percentBasis} />
                <input type="hidden" name={`line.${index}.priority`} value={index + 1} />
                {line.kind !== "fixed" ? (
                  <input type="hidden" name={`line.${index}.amount`} value="0" />
                ) : null}
                {line.kind !== "percent" ? (
                  <input type="hidden" name={`line.${index}.percent`} value="0" />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-card bg-surface-2 p-3.5">
        <Field label={t("preview")} htmlFor="template-preview" hint={t("previewHelp")}>
          <AmountInput
            id="template-preview"
            value={preview}
            onChange={(event) => setPreview(event.target.value)}
            placeholder="1.500,00"
            className="max-w-40"
          />
        </Field>
        {previewCents > 0 ? (
          <p
            className={cn(
              "mt-2 text-sm font-semibold",
              plan.unassignedCents === 0 ? "text-good" : "text-critical",
            )}
          >
            {tPayday("unassigned")}:{" "}
            {formatMoney(plan.unassignedCents, baseCurrency, locale, { compact: true })}
          </p>
        ) : null}
      </div>

      {errors.length > 0 ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {t(`issues.${errors[0]!.code}`)}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {state.messageKey && state.messageKey.startsWith("templates.issues.")
            ? t(`issues.${state.messageKey.split(".").pop()}`)
            : tCommon("error")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || errors.length > 0}>
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
        {!inline ? (
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );

  if (inline) return <Card className="p-5">{body}</Card>;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("new")}
        className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-card bg-surface-1 p-5 sm:rounded-card"
      >
        <h2 className="mb-4 text-xl font-bold text-ink">{template ? t("edit") : t("new")}</h2>
        {body}
      </div>
    </div>
  );
}

function plain(cents: number, currency: string): string {
  return toMajor(cents, currency).toFixed(2).replace(".", ",");
}
