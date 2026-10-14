/**
 * Primitive di interfaccia, scritte sul file di design: pulsanti a pillola,
 * schede morbide, campi caldi. Nessuna dipendenza runtime, API in stile
 * shadcn/ui (`className` che si fonde con quella interna).
 */
import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:bg-border-strong",
  secondary: "bg-surface-1 text-ink border border-border hover:bg-surface-2",
  outline: "border border-border-strong bg-transparent text-ink hover:bg-surface-2",
  ghost: "text-ink-secondary hover:bg-surface-2 hover:text-ink",
  danger: "bg-critical text-white hover:brightness-95",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "size-11 justify-center",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const buttonBase =
  "inline-flex items-center justify-center rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70";

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

export function LinkButton({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <a
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

type CardTone = "plain" | "soft" | "accent" | "good" | "warning";

const cardTones: Record<CardTone, string> = {
  plain: "bg-surface-1 border border-border",
  soft: "bg-surface-2 border border-transparent",
  accent: "bg-surface-3 border border-transparent",
  good: "bg-good-soft border border-transparent",
  warning: "bg-warning-soft border border-transparent",
};

export function Card({
  className,
  tone = "plain",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: CardTone }) {
  return <section className={cn("rounded-card", cardTones[tone], className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-3 p-5 pb-3", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-bold text-ink", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-secondary", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 border-t border-border px-5 py-4", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-medium text-ink-secondary", className)} {...props} />
  );
}

const fieldBase =
  "w-full rounded-field border border-border-strong bg-surface-1 px-3.5 text-ink placeholder:text-ink-muted transition-colors focus:border-accent aria-[invalid=true]:border-critical disabled:bg-surface-2 disabled:text-ink-muted";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />;
  },
);

/** Campo importo: cifre allineate e tastierino numerico su telefono. */
export const AmountInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function AmountInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn(fieldBase, "tabular h-11 text-right font-semibold", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(fieldBase, "h-11 pr-9", className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-20 py-2.5", className)} {...props} />;
});

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Checkbox con etichetta. L'input sta dentro la `label`, cosi non serve un id
 * generato: `useId` non e disponibile nei componenti server.
 */
export function Checkbox({
  className,
  label,
  description,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded border-border-strong accent-[var(--color-accent)]",
          className,
        )}
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description ? <span className="block text-xs text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

/** Scelta a pillole, come i filtri e i selettori di categoria del design. */
export function ChipRadio({
  name,
  value,
  checked,
  onChange,
  children,
  className,
}: {
  name: string;
  value: string;
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        checked
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-border bg-surface-1 text-ink-secondary hover:border-border-strong",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Indicatori
// ---------------------------------------------------------------------------

type Tone = "neutral" | "accent" | "good" | "warning" | "critical";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-secondary",
  accent: "bg-accent-soft text-accent-ink",
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Barra di avanzamento. La traccia e uno step chiaro dello stesso colore del
 * riempimento, cosi lo stato si legge lungo tutta la barra.
 */
export function Progress({
  value,
  tone = "accent",
  className,
  label,
}: {
  /** Valore tra 0 e 1; oltre 1 la barra resta piena. */
  value: number;
  tone?: "accent" | "good" | "warning" | "critical";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = {
    accent: "bg-accent",
    good: "bg-good",
    warning: "bg-warning",
    critical: "bg-critical",
  }[tone];
  const track = {
    accent: "bg-accent-soft",
    good: "bg-good-soft",
    warning: "bg-warning-soft",
    critical: "bg-critical-soft",
  }[tone];
  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full", track, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({
  tone = "neutral",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    neutral: "bg-surface-2 text-ink-secondary",
    accent: "bg-accent-soft text-accent-ink",
    good: "bg-good-soft text-good",
    warning: "bg-warning-soft text-warning",
    critical: "bg-critical-soft text-critical",
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card px-4 py-3.5 text-sm",
        tones[tone],
        className,
      )}
      role={tone === "critical" ? "alert" : "status"}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-prose text-sm text-ink-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Intestazione di pagina: occhiello, titolo forte, azioni a destra. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-sm text-ink-muted">{eyebrow}</p> : null}
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-sm text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Tabella con scorrimento orizzontale solo su di se, mai sulla pagina. */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0", className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full min-w-[34rem] border-collapse text-sm", className)} {...props} />
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-3 pb-2 text-left text-xs font-semibold text-ink-muted", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-3 align-middle", className)} {...props} />;
}

/** Riga di tabella a fasce alterne, come nel design. */
export function Tr({
  striped = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { striped?: boolean }) {
  return (
    <tr
      className={cn(
        "rounded-chip",
        striped ? "bg-surface-2/70 [&>td:first-child]:rounded-l-chip [&>td:last-child]:rounded-r-chip" : null,
        className,
      )}
      {...props}
    />
  );
}

/** Pastello della busta o del Pocket, per indice di colore. */
export const POCKET_TONES = [
  "bg-pocket-1 text-pocket-ink-1",
  "bg-pocket-2 text-pocket-ink-2",
  "bg-pocket-3 text-pocket-ink-3",
  "bg-pocket-4 text-pocket-ink-4",
  "bg-pocket-5 text-pocket-ink-5",
  "bg-pocket-6 text-pocket-ink-6",
  "bg-pocket-7 text-pocket-ink-7",
] as const;

export const POCKET_DOTS = [
  "bg-[var(--color-pocket-ink-1)]",
  "bg-[var(--color-pocket-ink-2)]",
  "bg-[var(--color-pocket-ink-3)]",
  "bg-[var(--color-pocket-ink-4)]",
  "bg-[var(--color-pocket-ink-5)]",
  "bg-[var(--color-pocket-ink-6)]",
  "bg-[var(--color-pocket-ink-7)]",
] as const;

export function pocketTone(color: number): string {
  return POCKET_TONES[Math.abs(color) % POCKET_TONES.length]!;
}

export function pocketDot(color: number): string {
  return POCKET_DOTS[Math.abs(color) % POCKET_DOTS.length]!;
}
