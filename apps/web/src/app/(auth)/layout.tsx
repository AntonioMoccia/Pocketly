/** Guscio delle pagine pubbliche: una scheda al centro, niente navigazione. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold text-ink">Pocketly</p>
          <p className="text-sm text-ink-muted">Ogni euro riceve una destinazione</p>
        </div>
        {children}
      </div>
    </div>
  );
}
