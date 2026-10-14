import { getTranslations } from "next-intl/server";

export default async function OfflinePage() {
  const t = await getTranslations("pwa");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold text-ink">{t("offline")}</h1>
      <p className="text-sm text-ink-secondary">{t("offlineDesc")}</p>
    </main>
  );
}
