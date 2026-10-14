import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { getTemplate } from "@/data/templates";
import { listEnvelopes } from "@/data/envelopes";
import { deleteTemplateAction, duplicateTemplateAction } from "@/app/actions/misc";
import { Button, PageHeader } from "@/components/ui";
import { TemplateEditor } from "../template-editor";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireContext();
  const t = await getTranslations("templates");
  const tCommon = await getTranslations("common");
  const { id } = await params;

  const template = await getTemplate(id);
  if (!template) notFound();

  const envelopes = await listEnvelopes();

  return (
    <div className="space-y-5">
      <Link href="/templates" className="text-sm font-semibold text-accent hover:underline">
        ← {t("title")}
      </Link>

      <PageHeader title={template.name} description={t("subtitle")} />

      <TemplateEditor
        inline
        template={template}
        envelopes={envelopes.map((envelope) => ({
          id: envelope.id,
          name: envelope.name,
          mainAccountName: envelope.mainAccountName,
          color: envelope.color,
        }))}
        baseCurrency={context.household.baseCurrency}
        locale={context.locale}
      />

      <div className="flex flex-wrap gap-2">
        <form action={duplicateTemplateAction}>
          <input type="hidden" name="templateId" value={id} />
          <input type="hidden" name="name" value={`${template.name} (2)`} />
          <Button type="submit" variant="outline">
            {t("duplicate")}
          </Button>
        </form>
        <form action={deleteTemplateAction}>
          <input type="hidden" name="templateId" value={id} />
          <Button type="submit" variant="ghost" className="text-critical">
            {tCommon("delete")}
          </Button>
        </form>
      </div>
    </div>
  );
}
