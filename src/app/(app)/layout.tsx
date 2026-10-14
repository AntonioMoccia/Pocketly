import { requireContext } from "@/lib/session";
import { BottomNav, Logo, Sidebar } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { listMembers } from "@/server/household";

/**
 * Guscio dell'app autenticata. `requireContext` manda al login chi non ha
 * sessione e all'onboarding chi non ha ancora un household.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireContext();
  const members = await listMembers(context.household.id);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        householdName={context.household.name}
        memberCount={members.length}
        baseCurrency={context.household.baseCurrency}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 bg-surface/90 px-4 backdrop-blur sm:px-6 lg:hidden">
          <span className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-lg font-extrabold tracking-tight text-ink">Pocketly</span>
          </span>
          <UserMenu
            name={context.user.name}
            email={context.user.email}
            locale={context.locale}
          />
        </header>

        <div className="hidden justify-end px-6 pt-5 lg:flex">
          <UserMenu name={context.user.name} email={context.user.email} locale={context.locale} />
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-2 sm:px-6 lg:pb-10 lg:pt-3">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
