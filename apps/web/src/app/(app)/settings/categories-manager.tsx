"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteCategoryAction, saveCategoryAction } from "@/app/actions/transactions";
import { idleState } from "@/lib/action-state";
import { Button, Field, Input, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { GroupedPicker } from "@/components/grouped-picker";

type Kind = "expense" | "income" | "transfer";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  kind: Kind;
  defaultEnvelopeId: string | null;
};

type Envelope = { id: string; name: string; mainAccountName: string; color: number };

const KINDS: Kind[] = ["expense", "income", "transfer"];

/**
 * Albero delle categorie, raggruppato per tipo: le sottocategorie stanno
 * sotto la madre. Una sottocategoria la cui madre manca o e di un altro tipo
 * si mostra al primo livello, cosi non sparisce dalla lista.
 */
export function CategoriesManager({
  categories,
  envelopes,
  readOnly,
}: {
  categories: Category[];
  envelopes: Envelope[];
  readOnly: boolean;
}) {
  const t = useTranslations("settings");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const closeEdit = React.useCallback(() => setEditingId(null), []);
  const closeAdd = React.useCallback(() => setAdding(false), []);

  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope.name]));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const isRoot = (category: Category) => {
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    return !parent || parent.kind !== category.kind || parent.id === category.id;
  };

  return (
    <div className="space-y-5">
      {categories.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("categoriesEmpty")}</p>
      ) : null}

      {KINDS.map((kind) => {
        const roots = categories.filter((category) => category.kind === kind && isRoot(category));
        if (roots.length === 0) return null;
        const ordered = roots.flatMap((root) => [
          root,
          ...categories.filter((child) => child.parentId === root.id && !isRoot(child)),
        ]);
        return (
          <section key={kind}>
            <h3 className="text-sm font-semibold text-ink-secondary">
              {t(`categoryKinds.${kind}`)}
            </h3>
            <ul className="mt-1 divide-y divide-border">
              {ordered.map((category) => (
                <li key={category.id} className="py-2.5">
                  {editingId === category.id ? (
                    <CategoryForm
                      category={category}
                      categories={categories}
                      envelopes={envelopes}
                      onDone={closeEdit}
                    />
                  ) : (
                    <div
                      className={
                        isRoot(category)
                          ? "flex items-center justify-between gap-3"
                          : "flex items-center justify-between gap-3 pl-5"
                      }
                    >
                      <span className="min-w-0 text-sm">
                        <span className="block truncate text-ink">
                          {isRoot(category) ? null : <span className="text-ink-muted">↳ </span>}
                          {category.name}
                        </span>
                        {category.defaultEnvelopeId ? (
                          <span className="block truncate text-xs text-ink-muted">
                            {t("categoryEnvelopeOf", {
                              envelope: envelopeById.get(category.defaultEnvelopeId) ?? "—",
                            })}
                          </span>
                        ) : null}
                      </span>
                      {readOnly ? null : (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAdding(false);
                              setEditingId(category.id);
                            }}
                          >
                            {t("categoryEdit")}
                          </Button>
                          <ConfirmButton
                            action={deleteCategoryAction}
                            label={t("categoryDelete")}
                            question={t("categoryDeleteQuestion")}
                            confirmLabel={t("categoryDelete")}
                            cancelLabel={t("categoryCancel")}
                          >
                            <input type="hidden" name="categoryId" value={category.id} />
                          </ConfirmButton>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {readOnly ? null : adding ? (
        <div className="rounded-card border border-border p-3.5">
          <CategoryForm categories={categories} envelopes={envelopes} onDone={closeAdd} />
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
        >
          {t("categoryAdd")}
        </Button>
      )}
      {readOnly ? null : <p className="text-xs text-ink-muted">{t("categoriesHelp")}</p>}
    </div>
  );
}

function CategoryForm({
  category,
  categories,
  envelopes,
  onDone,
}: {
  category?: Category;
  categories: Category[];
  envelopes: Envelope[];
  onDone: () => void;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(saveCategoryAction, idleState);
  const [kind, setKind] = React.useState<Kind>(category?.kind ?? "expense");
  const [envelopeId, setEnvelopeId] = React.useState(category?.defaultEnvelopeId ?? null);
  const idPrefix = category ? `category-${category.id}` : "category-new";

  React.useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  // Un livello solo: la madre e una categoria di primo livello dello stesso
  // tipo, e una categoria con figlie non puo diventare figlia a sua volta.
  const parents = categories.filter(
    (candidate) =>
      candidate.kind === kind && candidate.parentId === null && candidate.id !== category?.id,
  );
  const hasChildren = category
    ? categories.some((candidate) => candidate.parentId === category.id)
    : false;
  const currentParent =
    category?.parentId && parents.some((parent) => parent.id === category.parentId)
      ? category.parentId
      : "";

  return (
    <form action={action} className="space-y-3">
      {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tCommon("name")} htmlFor={`${idPrefix}-name`}>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            required
            maxLength={60}
            defaultValue={category?.name ?? ""}
            autoFocus
          />
        </Field>
        <Field label={t("categoryKind")} htmlFor={`${idPrefix}-kind`}>
          <Select
            id={`${idPrefix}-kind`}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as Kind)}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`categoryKinds.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("categoryParent")} htmlFor={`${idPrefix}-parent`}>
          {/* Una select disabilitata non viene inviata: il campo nascosto tiene "nessuna". */}
          {hasChildren ? <input type="hidden" name="parentId" value="" /> : null}
          <Select
            key={kind}
            id={`${idPrefix}-parent`}
            name={hasChildren ? undefined : "parentId"}
            defaultValue={currentParent}
            disabled={hasChildren}
          >
            <option value="">{t("categoryNoParent")}</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("categoryEnvelope")}
          htmlFor={`${idPrefix}-envelope`}
          hint={t("categoryEnvelopeHelp")}
        >
          <GroupedPicker
            id={`${idPrefix}-envelope`}
            name="defaultEnvelopeId"
            value={envelopeId}
            onChange={setEnvelopeId}
            options={envelopes}
            placeholder={tCommon("none")}
          />
        </Field>
      </div>

      {state.status === "error" ? (
        <p className="text-sm font-medium text-critical" role="alert">
          {tCommon("error")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tCommon("saving") : category ? tCommon("save") : tCommon("create")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
