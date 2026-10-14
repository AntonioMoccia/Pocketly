import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { NotionImport } from "./notion-import";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import da Notion" };

export default async function ImportNotionPage() {
  const context = await requireContext();
  const t = await getTranslations("notion");

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/settings" className="text-sm font-semibold text-accent hover:underline">
        ← {t("backToSettings")}
      </Link>

      <PageHeader title={t("title")} description={t("subtitle")} />

      <NotionImport locale={context.locale} baseCurrency={context.household.baseCurrency} />
    </div>
  );
}
