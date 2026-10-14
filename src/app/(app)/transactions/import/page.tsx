import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listAccounts } from "@/server/accounts";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importa estratto conto" };

export default async function ImportPage() {
  const context = await requireContext();
  const t = await getTranslations("import");
  const accounts = await listAccounts(context.household.id);

  return (
    <div className="space-y-5">
      <Link href="/transactions" className="text-sm font-semibold text-accent hover:underline">
        ← {t("backToTransactions")}
      </Link>

      <PageHeader title={t("title")} description={t("subtitle")} />

      <ImportWizard
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
          institutionName: account.institutionName,
        }))}
        locale={context.locale}
      />
    </div>
  );
}
