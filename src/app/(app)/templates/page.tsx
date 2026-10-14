import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listTemplates } from "@/server/templates";
import { listEnvelopes } from "@/server/envelopes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modelli di ripartizione" };

export default async function TemplatesPage() {
  const context = await requireContext();
  const t = await getTranslations("templates");

  const [templates, envelopes] = await Promise.all([
    listTemplates(context.household.id),
    listEnvelopes(context.household.id),
  ]);

  const envelopeOptions = envelopes.map((envelope) => ({
    id: envelope.id,
    name: envelope.name,
    accountName: envelope.accountName,
    color: envelope.color,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <TemplateEditor
            envelopes={envelopeOptions}
            baseCurrency={context.household.baseCurrency}
            locale={context.locale}
          />
        }
      />

      {templates.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-ink">{template.name}</h2>
                  {template.isDefault ? <Badge tone="accent">{t("isDefault")}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-ink-secondary">
                  {t("lineCount", { count: template.lineCount })}
                </p>
                <div className="mt-4">
                  <Link
                    href={`/templates/${template.id}`}
                    className="text-sm font-semibold text-accent hover:underline"
                  >
                    {t("open")}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
