import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listAccounts, listInstitutions } from "@/server/accounts";
import { listMembers } from "@/server/household";
import { PageHeader } from "@/components/ui";
import { AccountForm } from "../account-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuovo conto" };

export default async function NewAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const context = await requireContext();
  const t = await getTranslations("accounts");
  const { parent } = await searchParams;

  const [accounts, institutions, members] = await Promise.all([
    listAccounts(context.household.id),
    listInstitutions(context.household.id),
    listMembers(context.household.id),
  ]);

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader title={parent ? t("newPocket") : t("new")} description={t("newDesc")} />
      <AccountForm
        parents={accounts
          .filter((account) => !account.parentId)
          .map((account) => ({ id: account.id, name: account.name, currency: account.currency }))}
        institutions={institutions.map((row) => ({ id: row.id, name: row.name }))}
        members={members.map((member) => ({ id: member.userId, name: member.name }))}
        baseCurrency={context.household.baseCurrency}
        defaultParentId={parent}
        onDone="/accounts"
      />
    </div>
  );
}
