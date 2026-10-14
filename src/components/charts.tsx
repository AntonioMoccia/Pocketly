"use client";

/**
 * Grafici del cruscotto, in SVG e CSS.
 *
 * Scelte che non sono di gusto:
 *  - i colori di categoria stanno in ordine fisso e seguono la categoria, non
 *    la sua posizione in classifica: un filtro che cambia il numero di voci non
 *    deve ricolorare quelle rimaste;
 *  - i segmenti che si toccano sono separati da 2px di superficie, non da un
 *    bordo colorato;
 *  - ogni grafico ha una lettura che non dipende dal colore: la barra impilata
 *    porta la legenda con gli importi, le colonne hanno l'asse etichettato.
 *    Due tinte della palette chiara stanno sotto 3:1 di contrasto, quindi le
 *    etichette visibili non sono un extra ma la condizione per usarle.
 */
import * as React from "react";
import { formatMoney } from "@/lib/money";
import { cn } from "./ui";

/** Ordine fisso dei colori di categoria. */
export const CATEGORY_VARS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
] as const;

export type Slice = {
  key: string;
  label: string;
  value: number;
  /** Indice del colore: segue la categoria, non l'ordine di arrivo. */
  colorIndex: number;
};

// ---------------------------------------------------------------------------
// Barra impilata del patrimonio
// ---------------------------------------------------------------------------

/**
 * Parte-su-totale del patrimonio. Barra impilata invece di una ciambella: i
 * nomi delle categorie sono lunghi e le quote vanno confrontate tra loro, non
 * lette come angoli.
 */
export function CategoryBar({
  slices,
  currency,
  locale,
  emptyLabel,
}: {
  slices: Slice[];
  currency: string;
  locale: string;
  emptyLabel: string;
}) {
  // Solo le voci positive: una quota negativa non ha una larghezza sensata in
  // una parte-su-totale, e comparirebbe come un segmento che non esiste.
  const visible = slices.filter((slice) => slice.value > 0);
  const total = visible.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return <p className="py-4 text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden" role="img" aria-hidden="true">
        {visible.map((slice) => (
          <div
            key={slice.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(slice.value / total) * 100}%`,
              backgroundColor: CATEGORY_VARS[slice.colorIndex % CATEGORY_VARS.length],
            }}
          />
        ))}
      </div>

      <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
        {visible.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_VARS[slice.colorIndex % CATEGORY_VARS.length] }}
            />
            <span className="text-ink-secondary">{slice.label}</span>
            <span className="tabular font-semibold text-ink">
              {formatMoney(slice.value, currency, locale, { compact: true })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Andamento mensile
// ---------------------------------------------------------------------------

export type MonthPoint = {
  /** Primo giorno del mese, YYYY-MM-DD. */
  date: string;
  total: number;
};

/**
 * Patrimonio mese per mese. Colonne e non linea: gli snapshot sono mensili e
 * discreti, e una linea suggerirebbe un andamento continuo che non abbiamo
 * misurato. Il mese corrente e in evidenza, i precedenti in tono tenue.
 */
export function MonthlyTrend({
  points,
  currency,
  locale,
  emptyLabel,
}: {
  points: MonthPoint[];
  currency: string;
  locale: string;
  emptyLabel: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);

  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  const max = Math.max(...points.map((point) => point.total), 1);
  const month = (date: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );

  return (
    <div>
      <div className="flex h-44 items-end gap-2">
        {points.map((point, index) => {
          const isLast = index === points.length - 1;
          // Altezza minima visibile: una colonna a zero deve comunque esistere.
          const height = Math.max(4, (Math.max(0, point.total) / max) * 100);
          return (
            <button
              key={point.date}
              type="button"
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              aria-label={`${month(point.date)}: ${formatMoney(point.total, currency, locale)}`}
            >
              {active === index ? (
                <span className="tabular absolute inset-x-0 -top-1 z-10 mx-auto w-max rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-surface-1">
                  {formatMoney(point.total, currency, locale, { compact: true })}
                </span>
              ) : null}
              <span
                className={cn(
                  "w-full rounded-xl transition-colors",
                  isLast ? "bg-accent-bright" : "bg-accent-soft group-hover:bg-accent-bright/60",
                )}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2">
        {points.map((point, index) => (
          <span
            key={point.date}
            className={cn(
              "flex-1 text-center text-xs",
              index === points.length - 1 ? "font-bold text-ink" : "text-ink-muted",
            )}
          >
            {month(point.date)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anello di avanzamento
// ---------------------------------------------------------------------------

/** Anello di avanzamento di un obiettivo, con la percentuale al centro. */
export function ProgressRing({
  value,
  size = 112,
  thickness = 14,
  tone = "good",
  locale,
}: {
  /** Valore tra 0 e 1. */
  value: number;
  size?: number;
  thickness?: number;
  tone?: "good" | "accent";
  locale: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = tone === "good" ? "var(--color-good)" : "var(--color-accent)";
  const track = tone === "good" ? "var(--color-surface-1)" : "var(--color-accent-soft)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${clamped * circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-ink">
        {new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
          clamped,
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra di una busta
// ---------------------------------------------------------------------------

/**
 * Speso su assegnato per una busta. Oltre il 100% la barra diventa critica:
 * lo sforamento e la condizione che la schermata deve far notare.
 */
export function EnvelopeBar({
  spent,
  assigned,
  className,
}: {
  spent: number;
  assigned: number;
  className?: string;
}) {
  const over = assigned > 0 ? spent > assigned : spent > 0;
  const ratio = assigned > 0 ? Math.min(1, spent / assigned) : over ? 1 : 0;
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full",
        over ? "bg-critical-soft" : "bg-surface-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", over ? "bg-critical" : "bg-ink-muted")}
        style={{ width: `${(over ? 1 : ratio) * 100}%` }}
      />
    </div>
  );
}

/** Etichette d'asse compatte: 12,5 k invece di 12.500,00. */
export function compactMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}
