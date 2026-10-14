"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { saveAccountAction } from "@/app/actions/accounts";
import { idleState } from "@/lib/action-state";
import {
  AmountInput,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ACCOUNT_CATEGORIES } from "@pocketly/domain/networth";

const TYPES = ["checking", "savings", "pocket", "investment", "cash", "other"] as const;

export type AccountFormData = {
  id?: string;
  name: string;
  type: string;
  category: string;
  currency: string;
  liquid: boolean;
  parentId: string | null;
  isDefault?: boolean;
  institutionId: string | null;
  note: string | null;
};

export function AccountForm({
  account,
  parents,
  institutions,
  members,
  baseCurrency,
  defaultParentId,
  onDone,
}: {
  account?: AccountFormData;
  parents: { id: string; name: string; currency: string }[];
  institutions: { id: string; name: string }[];
  members: { id: string; name: string }[];
  baseCurrency: string;
  defaultParentId?: string;
  onDone?: string;
}) {
  const t = useTranslations("accounts");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(saveAccountAction, idleState);

  const [parentId, setParentId] = useState(account?.parentId ?? defaultParentId ?? "");
  const parent = parents.find((row) => row.id === parentId);
  // Un Pocket condivide la valuta del conto che lo contiene: mescolare valute
  // dentro lo stesso conto renderebbe il totale del padre senza significato.
  const currency = parent?.currency ?? account?.currency ?? baseCurrency;
  // Un conto resta conto e un Pocket resta Pocket; il Pocket di default non
  // cambia nemmeno conto. Solo un Pocket qualsiasi sceglie il conto.
  const editing = Boolean(account?.id);
  const isContainer = editing && !account?.parentId;
  const parentLocked = isContainer || Boolean(account?.isDefault);

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        {account?.id ? <input type="hidden" name="accountId" value={account.id} /> : null}
        {onDone ? <input type="hidden" name="redirectTo" value={onDone} /> : null}

        <Field label={t("name")} htmlFor="account-name">
          <Input
            id="account-name"
            name="name"
            required
            maxLength={80}
            defaultValue={account?.name ?? ""}
            placeholder={t("namePlaceholder")}
          />
        </Field>

        {parentLocked ? (
          <input type="hidden" name="parentId" value={account?.parentId ?? ""} />
        ) : (
          <Field label={t("parent")} htmlFor="account-parent" hint={t("parentHelp")}>
            <Select
              id="account-parent"
              name="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              {editing ? null : <option value="">{t("parentNone")}</option>}
              {parents
                .filter((row) => row.id !== account?.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("type")} htmlFor="account-type">
            <Select id="account-type" name="type" defaultValue={account?.type ?? (parentId ? "pocket" : "checking")}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("category")} htmlFor="account-category">
            <Select
              id="account-category"
              name="category"
              defaultValue={account?.category ?? (parentId ? "pocket" : "operational")}
            >
              {ACCOUNT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`categories.${category}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={tCommon("currency")}
            htmlFor="account-currency"
            hint={parent ? t("currencyLockedToParent") : undefined}
          >
            <Input
              id="account-currency"
              name="currency"
              required
              maxLength={3}
              minLength={3}
              readOnly={Boolean(parent)}
              value={parent ? currency : undefined}
              defaultValue={parent ? undefined : currency}
              className="uppercase"
            />
          </Field>

          <Field label={t("institution")} htmlFor="account-institution">
            <Select
              id="account-institution"
              name="institutionId"
              defaultValue={account?.institutionId ?? ""}
            >
              <option value="">{t("institutionNone")}</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("institutionNew")} htmlFor="account-institution-name">
          <Input
            id="account-institution-name"
            name="institutionName"
            maxLength={60}
            placeholder={t("institutionNewPlaceholder")}
          />
        </Field>

        {members.length > 1 ? (
          <Field label={t("owner")} htmlFor="account-owner">
            <Select id="account-owner" name="ownerUserId" defaultValue="">
              <option value="">{t("ownerShared")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {!account?.id ? (
          <Field
            label={t("initialBalance")}
            htmlFor="account-balance"
            hint={parentId ? t("initialBalanceHelp") : t("initialBalanceDefaultPocketHelp")}
          >
            <AmountInput id="account-balance" name="initialBalance" placeholder="0,00" />
          </Field>
        ) : null}

        <Checkbox
          name="liquid"
          label={t("liquid")}
          description={t("liquidHelp")}
          defaultChecked={account?.liquid ?? true}
        />

        <Field label={tCommon("note")} htmlFor="account-note">
          <Textarea id="account-note" name="note" maxLength={500} defaultValue={account?.note ?? ""} />
        </Field>

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {state.messageKey?.startsWith("errors.") && tErrors.has(state.messageKey.slice(7))
              ? tErrors(state.messageKey.slice(7))
              : tErrors("validation")}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
          <a
            href="/accounts"
            className="inline-flex h-11 items-center rounded-full px-5 font-semibold text-ink-secondary hover:bg-surface-2"
          >
            {tCommon("cancel")}
          </a>
        </div>
      </form>
    </Card>
  );
}
