import { getTranslations } from "next-intl/server";
import { LinkButton } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-ink-muted">404</p>
      <h1 className="text-xl font-semibold text-ink">{t("notFound")}</h1>
      <p className="text-sm text-ink-secondary">{t("notFoundDesc")}</p>
      <LinkButton href="/">{t("backHome")}</LinkButton>
    </main>
  );
}
