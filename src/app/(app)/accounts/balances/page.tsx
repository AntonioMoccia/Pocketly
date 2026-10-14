import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { listAccounts } from "@/server/accounts";
import { today } from "@/lib/date";
import { PageHeader } from "@/components/ui";
import { BalancesPanel } from "../balances-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aggiorna saldi" };

/** Su telefono l'aggiornamento saldi e una pagina a se, non un pannello. */
export default async function BalancesPage() {
  const context = await requireContext();
  const t = await getTranslations("balances");
  const accounts = await listAccounts(context.household.id);
  const byId = new Map(accounts.map((account) => [account.id, account]));

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <BalancesPanel
        compact
        locale={context.locale}
        today={today()}
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          currency: account.currency,
          balanceCents: account.balanceCents,
          balanceDate: account.balanceDate,
          institutionName: account.institutionName,
          parentName: account.parentId ? (byId.get(account.parentId)?.name ?? null) : null,
        }))}
      />
    </div>
  );
}
