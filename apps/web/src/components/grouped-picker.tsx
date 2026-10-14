"use client";

import * as React from "react";
import { cn, pocketDot } from "@/components/ui";

export type GroupedPickerOption = {
  id: string;
  name: string;
  /** Il conto principale: le buste dei suoi Pocket stanno nel suo gruppo. */
  mainAccountName: string;
  /** Pallino colorato, per le buste. */
  color?: number;
};

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * Conti in ordine alfabetico. In ogni conto viene prima la busta del conto
 * stesso, poi quelle dei suoi Pocket in ordine alfabetico.
 */
function groupByAccount(envelopes: GroupedPickerOption[]) {
  const groups = new Map<string, GroupedPickerOption[]>();
  for (const envelope of envelopes) {
    const group = groups.get(envelope.mainAccountName) ?? [];
    group.push(envelope);
    groups.set(envelope.mainAccountName, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([accountName, items]) => ({
      accountName,
      items: [...items].sort(
        (a, b) =>
          Number(b.name === accountName) - Number(a.name === accountName) ||
          collator.compare(a.name, b.name),
      ),
    }));
}

/**
 * Tendina divisa per conto: il conto fa da intestazione, le buste o i Pocket
 * sono le sue sottovoci. Il valore viaggia nel form tramite un input nascosto.
 * Senza `placeholder` non c'e la voce vuota: una scelta e obbligatoria.
 */
export function GroupedPicker({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name: string;
  value: string | null;
  onChange: (id: string | null) => void;
  options: GroupedPickerOption[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const groups = React.useMemo(() => groupByAccount(options), [options]);
  const selected = options.find((envelope) => envelope.id === value) ?? null;

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function toggle() {
    if (open) return setOpen(false);
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  }

  function pick(id: string | null) {
    onChange(id);
    close();
  }

  // Chiusura su click esterno, scroll o resize: il pannello è `fixed` e
  // resterebbe sospeso lontano dal campo.
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onScroll = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // All'apertura il fuoco va sulla busta scelta, o sulla prima voce.
  React.useEffect(() => {
    if (!open) return;
    const target =
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      listRef.current?.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }, [open]);

  function onListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      options[Math.max(0, Math.min(options.length - 1, next))]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(options.length - 1);
    else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    }
  }

  // Sotto il campo se c'è spazio, altrimenti sopra.
  let panelStyle: React.CSSProperties | undefined;
  if (rect) {
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const placeBelow = below >= 240 || below >= above;
    panelStyle = {
      left: rect.left,
      width: Math.max(rect.width, 260),
      maxHeight: Math.min(380, placeBelow ? below : above),
      ...(placeBelow ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
    };
  }

  return (
    <>
      <input type="hidden" name={name} value={value ?? ""} />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-field border border-border-strong bg-surface-1 px-3.5 text-left text-ink transition-colors focus:border-accent",
          className,
        )}
      >
        {selected ? (
          <>
            {selected.color !== undefined ? (
              <span
                aria-hidden="true"
                className={cn("size-2.5 shrink-0 rounded-full", pocketDot(selected.color))}
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate">
              {selected.name}
              {selected.name !== selected.mainAccountName ? (
                <span className="text-ink-muted"> · {selected.mainAccountName}</span>
              ) : null}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-ink-muted">{placeholder}</span>
        )}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={cn("size-4 shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={onListKeyDown}
          style={panelStyle}
          className="fixed z-50 overflow-y-auto rounded-field border border-border bg-surface-1 p-1.5 shadow-lg"
        >
          {placeholder ? (
            <GroupedPickerItem selected={value === null} onPick={() => pick(null)}>
              <span className="text-ink-muted">{placeholder}</span>
            </GroupedPickerItem>
          ) : null}
          {groups.map((group) => (
            <div key={group.accountName} role="group" aria-label={group.accountName} className="mt-1">
              <div className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {group.accountName}
              </div>
              {group.items.map((envelope) => (
                <GroupedPickerItem
                  key={envelope.id}
                  selected={envelope.id === value}
                  onPick={() => pick(envelope.id)}
                  className="pl-6"
                >
                  {envelope.color !== undefined ? (
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 shrink-0 rounded-full", pocketDot(envelope.color))}
                    />
                  ) : null}
                  <span className="truncate">{envelope.name}</span>
                </GroupedPickerItem>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function GroupedPickerItem({
  selected,
  onPick,
  className,
  children,
}: {
  selected: boolean;
  onPick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onPick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-chip px-2.5 py-2 text-sm text-ink outline-none hover:bg-surface-2 focus:bg-surface-2",
        selected && "font-semibold",
        className,
      )}
    >
      {children}
      {selected ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-auto size-4 shrink-0 text-accent">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      ) : null}
    </div>
  );
}
