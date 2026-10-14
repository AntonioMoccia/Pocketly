import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { TwoFactorForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verifica in due passaggi" };

export default async function TwoFactorPage() {
  const t = await getTranslations("auth");

  return (
    <Card className="p-6">
      <h1 className="text-xl font-bold text-ink">{t("twoFactorTitle")}</h1>
      <p className="mt-1 text-sm text-ink-secondary">{t("twoFactorHint")}</p>
      <TwoFactorForm />
    </Card>
  );
}
