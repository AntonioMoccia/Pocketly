import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getContext, getSession } from "@/lib/session";
import { listAccounts } from "@/data/accounts";
import { listEnvelopes } from "@/data/envelopes";
import { Logo } from "@/components/nav";
import { OnboardingFlow } from "./flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Benvenuto" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("onboarding");
  const hasHousehold = Boolean(await getContext());

  // L'onboarding riprende dal punto giusto: chi ha gia un household passa ai
  // conti, chi ha gia i conti al modello.
  const [accounts, envelopes] = hasHousehold
    ? await Promise.all([listAccounts(), listEnvelopes()])
    : [[], []];

  const step = !hasHousehold ? 1 : accounts.length === 0 ? 2 : 3;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10">
      <header className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-ink-secondary">{t("subtitle")}</p>
      </header>

      <OnboardingFlow
        initialStep={step}
        hasEnvelopes={envelopes.length > 0}
        createdAccounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          parentId: account.parentId,
        }))}
      />
    </div>
  );
}
