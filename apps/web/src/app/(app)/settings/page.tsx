import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listInvites, listMembers } from "@/data/household";
import { listRules } from "@/data/transactions";
import { listCategories } from "@/data/categories";
import { isMonthClosed, listEnvelopes } from "@/data/envelopes";
import { latestRates } from "@/data/fx";
import { describeClient, listSessions } from "@/data/sessions";
import { api } from "@/lib/api";
import { formatDate, startOfMonth, today } from "@pocketly/domain/date";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardDescription,
  CardTitle,
  LinkButton,
  PageHeader,
} from "@/components/ui";
import {
  refreshRatesAction,
  removeMemberAction,
  revokeInviteAction,
  snapshotNowAction,
} from "@/app/actions/misc";
import { deleteRuleAction } from "@/app/actions/transactions";
import { revokeSessionAction } from "@/app/actions/session";
import { HouseholdForm } from "./household-form";
import { InviteForm } from "./invite-form";
import { SecurityForm } from "./security-form";
import { CloseMonthForm } from "./close-month-form";
import { CategoriesManager } from "./categories-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const context = await requireContext();
  const t = await getTranslations("settings");
  const { household, locale, role } = context;
  const month = startOfMonth(today());

  const [members, invites, rules, categories, envelopes, rates, monthClosed, instance, sessions] =
    await Promise.all([
    listMembers(),
    role === "owner" ? listInvites() : Promise.resolve([]),
    listRules(),
    listCategories(),
    listEnvelopes(),
    latestRates(),
    isMonthClosed(month),
    api.get<{ edition: "self" | "cloud"; signup: "invite" | "open" }>("/instance"),
    listSessions(),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope.name]));

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("household")}</CardTitle>
            <CardDescription>{t("householdDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <HouseholdForm
            household={{
              name: household.name,
              baseCurrency: household.baseCurrency,
              timezone: household.timezone,
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("members")}</CardTitle>
            <CardDescription>{t("membersDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{member.name}</p>
                  <p className="truncate text-xs text-ink-muted">{member.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={member.role === "owner" ? "accent" : "neutral"}>
                    {t(`roles.${member.role}`)}
                  </Badge>
                  {role === "owner" && member.userId !== context.user.id ? (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="memberId" value={member.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-critical">
                        {t("removeMember")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {role === "owner" ? (
            <>
              <InviteForm />
              {invites.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-ink-secondary">{t("invitePending")}</h3>
                  <ul className="mt-2 space-y-2">
                    {invites.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {invite.email ?? t(`roles.${invite.role}`)} ·{" "}
                          {t("expiresOn", {
                            date: formatDate(invite.expiresAt.toISOString().slice(0, 10), locale),
                          })}
                        </span>
                        <form action={revokeInviteAction}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            {t("inviteRevoke")}
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("month")}</CardTitle>
            <CardDescription>{t("monthDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <CloseMonthForm month={month} closed={monthClosed} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("categories")}</CardTitle>
            <CardDescription>{t("categoriesDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <CategoriesManager
            categories={categories}
            envelopes={envelopes.map((envelope) => ({
              id: envelope.id,
              name: envelope.name,
              mainAccountName: envelope.mainAccountName,
              color: envelope.color,
            }))}
            readOnly={role === "viewer"}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("rules")}</CardTitle>
            <CardDescription>{t("rulesDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          {rules.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("rulesEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">
                      {t(`ruleFields.${rule.field}`)} {t(`ruleOperators.${rule.operator}`)}{" "}
                      <strong>{rule.value}</strong>
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      → {rule.categoryId ? categoryById.get(rule.categoryId) : "—"}
                      {rule.envelopeId ? ` · ${envelopeById.get(rule.envelopeId) ?? ""}` : ""}
                    </span>
                  </span>
                  <form action={deleteRuleAction}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-critical">
                      {t("deleteRule")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("security")}</CardTitle>
            <CardDescription>{t("securityDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <SecurityForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("sessions")}</CardTitle>
            <CardDescription>{t("sessionsDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-border">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">
                    {describeClient(session.userAgent)}
                    {session.current ? (
                      <Badge tone="good" className="ml-2">
                        {t("sessionCurrent")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {t("sessionDetail", {
                      ip: session.ipAddress ?? "—",
                      date: formatDate(session.updatedAt.slice(0, 10), locale),
                    })}
                  </span>
                </span>
                {session.current ? null : (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-critical">
                      {t("sessionRevoke")}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">{t("sessionsHelp")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("data")}</CardTitle>
            <CardDescription>{t("dataDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/api/export?format=json" variant="secondary" download>
              {t("exportJson")}
            </LinkButton>
            <LinkButton href="/api/export?format=csv" variant="secondary" download>
              {t("exportCsv")}
            </LinkButton>
            <LinkButton href="/transactions/import" variant="secondary">
              {t("importCsv")}
            </LinkButton>
            <LinkButton href="/settings/import-notion" variant="secondary">
              {t("importNotion")}
            </LinkButton>
          </div>
          <p className="text-xs text-ink-muted">{t("exportHelp")}</p>
          <p className="text-xs text-ink-muted">{t("backupHelp")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("instance")}</CardTitle>
            <CardDescription>{t("instanceDesc")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{t("edition")}</dt>
              <dd className="font-semibold text-ink">{t(`editions.${instance.edition}`)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{t("signupMode")}</dt>
              <dd className="font-semibold text-ink">{t(`signupModes.${instance.signup}`)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{t("fxRates")}</dt>
              <dd className="font-semibold text-ink">
                {rates.date ? formatDate(rates.date, locale) : t("jobsNever")}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <form action={refreshRatesAction}>
              <Button type="submit" variant="outline" size="sm">
                {t("refreshRates")}
              </Button>
            </form>
            <form action={snapshotNowAction}>
              <Button type="submit" variant="outline" size="sm">
                {t("snapshotNow")}
              </Button>
            </form>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
