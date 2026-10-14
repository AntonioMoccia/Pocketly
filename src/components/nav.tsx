"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "./ui";

/**
 * Navigazione. Su desktop una colonna a sinistra con le sei sezioni, su
 * telefono una barra in basso con le cinque che si usano a mano: le
 * impostazioni stanno nel menu dell'utente, non occupano un pollice.
 */
const SECTIONS = [
  { href: "/", key: "overview", short: "home", icon: "home" },
  { href: "/payday", key: "payday", short: "paydayShort", icon: "payday" },
  { href: "/transactions", key: "transactions", short: "transactions", icon: "transactions" },
  { href: "/accounts", key: "accounts", short: "accountsShort", icon: "accounts" },
  { href: "/goals", key: "goals", short: "goalsShort", icon: "goals" },
] as const;

const DESKTOP_ORDER = [
  { href: "/", key: "overview", icon: "home" },
  { href: "/payday", key: "payday", icon: "payday" },
  { href: "/accounts", key: "accounts", icon: "accounts" },
  { href: "/goals", key: "goals", icon: "goals" },
  { href: "/transactions", key: "transactions", icon: "transactions" },
  { href: "/settings", key: "settings", icon: "settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  householdName,
  memberCount,
  baseCurrency,
}: {
  householdName: string;
  memberCount: number;
  baseCurrency: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="hidden w-64 shrink-0 flex-col p-3 lg:flex">
      <div className="flex flex-1 flex-col rounded-card bg-sidebar p-3">
        <Link href="/" className="flex items-center gap-2.5 px-2 py-3">
          <Logo />
          <span className="text-xl font-extrabold tracking-tight text-ink">Pocketly</span>
        </Link>

        <ul className="mt-3 space-y-0.5">
          {DESKTOP_ORDER.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[0.9375rem] transition-colors",
                    active
                      ? "bg-surface-1 font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      : "text-ink-secondary hover:bg-surface-1/60 hover:text-ink",
                  )}
                >
                  <NavIcon name={item.icon} />
                  <span className="min-w-0">{t(item.key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto rounded-2xl bg-surface-1 p-3.5">
          <p className="text-xs text-ink-muted">{t("household")}</p>
          <p className="truncate font-bold text-ink">{householdName}</p>
          <p className="text-xs text-ink-muted">
            {t("members", { count: memberCount })} · {baseCurrency}
          </p>
        </div>
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-1 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {SECTIONS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-accent" : "text-ink-muted",
                )}
              >
                <NavIcon name={item.icon} size={22} />
                <span className="max-w-full truncate px-0.5">{t(item.short)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-accent-bright text-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.55}
        height={size * 0.55}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8h16a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z" />
        <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" />
      </svg>
    </span>
  );
}

/** Icone a tratto, disegnate qui per non caricare una libreria intera. */
function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      </>
    ),
    payday: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 1.8" />
      </>
    ),
    transactions: (
      <>
        <path d="M7 20V5m0 0L4 8.5M7 5l3 3.5" />
        <path d="M17 4v15m0 0 3-3.5M17 19l-3-3.5" />
      </>
    ),
    accounts: (
      <>
        <path d="M4 9h16a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1Z" />
        <path d="M8.5 9V7.5a3.5 3.5 0 0 1 7 0V9" />
      </>
    ),
    goals: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5l-1.5 1.5M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {paths[name] ?? paths.home}
    </svg>
  );
}
