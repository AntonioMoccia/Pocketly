"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createAccountsAction,
  createHouseholdAction,
  createTemplateAction,
} from "@/app/actions/onboarding";
import { idleState } from "@/lib/action-state";
import {
  AmountInput,
  Button,
  Card,
  Field,
  Input,
  Select,
  cn,
} from "@/components/ui";

type DraftAccount = {
  key: string;
  name: string;
  type: string;
  category: string;
  institutionName: string;
  balance: string;
  parentKey: string;
};

/** Conti suggeriti all'inizio: si cancellano o si cambiano, servono solo a partire. */
function starterAccounts(): DraftAccount[] {
  return [
    {
      key: "0",
      name: "",
      type: "checking",
      category: "operational",
      institutionName: "",
      balance: "",
      parentKey: "",
    },
  ];
}

export function OnboardingFlow({
  initialStep,
  createdAccounts,
  hasEnvelopes,
}: {
  initialStep: number;
  createdAccounts: { id: string; name: string; parentId: string | null }[];
  hasEnvelopes: boolean;
}) {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(initialStep);

  return (
    <div className="space-y-4">
      <ol className="flex gap-2" aria-label={t("steps")}>
        {[1, 2, 3].map((number) => (
          <li
            key={number}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              number < step ? "bg-good" : number === step ? "bg-accent" : "bg-border",
            )}
          >
            <span className="sr-only">{t("step", { current: number, total: 3 })}</span>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <HouseholdStep onDone={() => setStep(2)} />
      ) : step === 2 ? (
        <AccountsStep onDone={() => setStep(3)} created={createdAccounts} />
      ) : (
        <TemplateStep hasEnvelopes={hasEnvelopes} />
      )}
    </div>
  );
}

function HouseholdStep({ onDone }: { onDone: () => void }) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(createHouseholdAction, idleState);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  const timezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/Rome";

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-ink">{t("step1Title")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("step1Desc")}</p>

      <form action={action} className="mt-4 space-y-4">
        <Field label={t("householdName")} htmlFor="household-name">
          <Input
            id="household-name"
            name="name"
            required
            maxLength={80}
            placeholder={t("householdNamePlaceholder")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("baseCurrency")} htmlFor="base-currency" hint={t("baseCurrencyHelp")}>
            <Input
              id="base-currency"
              name="baseCurrency"
              required
              minLength={3}
              maxLength={3}
              defaultValue="EUR"
              className="uppercase"
            />
          </Field>

          <Field label={t("language")} htmlFor="locale">
            <Select id="locale" name="locale" defaultValue="it">
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>

        <input type="hidden" name="timezone" value={timezone} />

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {tCommon("error")}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("next")}
        </Button>
      </form>
    </Card>
  );
}

function AccountsStep({
  onDone,
  created,
}: {
  onDone: () => void;
  created: { id: string; name: string; parentId: string | null }[];
}) {
  const t = useTranslations("onboarding");
  const tAccounts = useTranslations("accounts");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(createAccountsAction, idleState);
  const [rows, setRows] = useState<DraftAccount[]>(starterAccounts);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  function add(parentKey = "") {
    setRows((current) => [
      ...current,
      {
        key: String(Date.now()),
        name: "",
        type: parentKey ? "pocket" : "checking",
        category: parentKey ? "pocket" : "operational",
        institutionName: "",
        balance: "",
        parentKey,
      },
    ]);
  }

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-ink">{t("step2Title")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("step2Desc")}</p>

      {created.length > 0 ? (
        <p className="mt-2 text-sm text-good">
          {t("alreadyCreated", { count: created.length })}
        </p>
      ) : null}

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="baseCurrency" value="EUR" />

        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className={cn("rounded-card p-3.5", row.parentKey ? "ml-5 bg-surface-2" : "bg-surface-2/60")}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
                <Input
                  name={`account.${index}.name`}
                  defaultValue={row.name}
                  placeholder={row.parentKey ? t("pocketNamePlaceholder") : t("accountNamePlaceholder")}
                  aria-label={tCommon("name")}
                />

                {row.parentKey ? (
                  <span className="hidden sm:block" />
                ) : (
                  <Input
                    name={`account.${index}.institutionName`}
                    defaultValue={row.institutionName}
                    placeholder={tAccounts("institution")}
                    aria-label={tAccounts("institution")}
                  />
                )}

                <AmountInput
                  name={`account.${index}.balance`}
                  defaultValue={row.balance}
                  placeholder="0,00"
                  aria-label={t("initialBalance")}
                />

                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                  className="justify-self-end rounded-lg px-2 py-1 text-ink-muted hover:text-critical"
                  aria-label={tCommon("delete")}
                >
                  ×
                </button>
              </div>

              <input type="hidden" name={`account.${index}.type`} value={row.type} />
              <input type="hidden" name={`account.${index}.category`} value={row.category} />
              <input type="hidden" name={`account.${index}.currency`} value="EUR" />
              <input type="hidden" name={`account.${index}.liquid`} value="true" />
              <input
                type="hidden"
                name={`account.${index}.parentIndex`}
                value={row.parentKey ? String(rows.findIndex((item) => item.key === row.parentKey)) : ""}
              />

              {!row.parentKey ? (
                <button
                  type="button"
                  onClick={() => add(row.key)}
                  className="mt-2 text-xs font-semibold text-accent hover:underline"
                >
                  + {t("addPocket")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <Button type="button" variant="secondary" onClick={() => add()}>
          + {t("addAccount")}
        </Button>

        <p className="text-xs text-ink-muted">{t("step2Help")}</p>

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {state.messageKey === "onboarding.noAccounts" ? t("noAccounts") : tCommon("error")}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("next")}
        </Button>
      </form>
    </Card>
  );
}

function TemplateStep({ hasEnvelopes }: { hasEnvelopes: boolean }) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [state, action, pending] = useActionState(createTemplateAction, idleState);
  const [preset, setPreset] = useState("employee");

  useEffect(() => {
    if (state.status === "success") router.push("/");
  }, [state.status, router]);

  const options = [
    { value: "employee", title: t("presetEmployee"), description: t("presetEmployeeDesc") },
    { value: "freelance", title: t("presetFreelance"), description: t("presetFreelanceDesc") },
    { value: "skip", title: t("presetEmpty"), description: t("presetEmptyDesc") },
  ];

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-ink">{t("step3Title")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("step3Desc")}</p>

      {!hasEnvelopes ? <p className="mt-2 text-sm text-warning">{t("noEnvelopesYet")}</p> : null}

      <form action={action} className="mt-4 space-y-4">
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("presetTitle")}</legend>
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors",
                preset === option.value
                  ? "border-accent bg-accent-soft/40"
                  : "border-border hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name="preset"
                value={option.value}
                checked={preset === option.value}
                onChange={() => setPreset(option.value)}
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block font-semibold text-ink">{option.title}</span>
                <span className="block text-sm text-ink-secondary">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {state.status === "error" ? (
          <p className="text-sm font-medium text-critical" role="alert">
            {tCommon("error")}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? tCommon("saving") : t("finish")}
        </Button>
      </form>
    </Card>
  );
}
