"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "./ui";
import { setLocaleAction, signOutAction } from "@/app/actions/session";

/**
 * Menu dell'utente: lingua, tema, impostazioni, uscita.
 *
 * Il tema si applica subito stampando `data-theme` sulla radice e si ricorda
 * in `localStorage`: e una preferenza del dispositivo, non del profilo.
 */
export function UserMenu({
  name,
  email,
  locale,
}: {
  name: string;
  email: string;
  locale: string;
}) {
  const t = useTranslations("nav");
  const tSettings = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink-secondary transition-colors hover:bg-border"
      >
        {initials || "?"}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 rounded-card border border-border bg-surface-1 p-2 shadow-xl"
        >
          <div className="px-3 py-2">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-ink-muted">{email}</p>
          </div>

          <div className="my-1 h-px bg-border" />

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm text-ink-secondary hover:bg-surface-2 hover:text-ink"
            role="menuitem"
          >
            {t("settings")}
          </Link>

          <div className="px-3 pb-1 pt-2.5">
            <p className="text-xs font-medium text-ink-muted">{tSettings("theme")}</p>
            <ThemeSwitch />
          </div>

          <div className="px-3 pb-2 pt-2.5">
            <p className="text-xs font-medium text-ink-muted">{tSettings("language")}</p>
            <div className="mt-1.5 flex gap-1.5">
              {(["it", "en"] as const).map((code) => (
                <form key={code} action={setLocaleAction} className="flex-1">
                  <input type="hidden" name="locale" value={code} />
                  <button
                    type="submit"
                    className={cn(
                      "w-full rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                      locale === code
                        ? "bg-accent-soft text-accent-ink"
                        : "bg-surface-2 text-ink-secondary hover:text-ink",
                    )}
                  >
                    {code === "it" ? "Italiano" : "English"}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink-secondary hover:bg-surface-2 hover:text-ink"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

function ThemeSwitch() {
  const t = useTranslations("settings.themes");
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("pocketly-theme");
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem("pocketly-theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("pocketly-theme", next);
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  return (
    <div className="mt-1.5 flex gap-1.5">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => apply(option)}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
            theme === option
              ? "bg-accent-soft text-accent-ink"
              : "bg-surface-2 text-ink-secondary hover:text-ink",
          )}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
