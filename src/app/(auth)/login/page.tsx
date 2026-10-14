import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { userCount } from "@/lib/auth";
import { Card } from "@/components/ui";
import { SignInForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accedi" };

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user) redirect("/");

  const t = await getTranslations("auth");
  // Su un'istanza appena installata si va dritti alla registrazione: il primo
  // utente non ha nulla con cui accedere.
  const count = await userCount();
  if (count === 0) redirect("/signup");

  return (
    <Card className="p-6">
      <h1 className="text-xl font-bold text-ink">{t("signInTitle")}</h1>
      <SignInForm />
      <p className="mt-5 text-center text-sm text-ink-secondary">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-semibold text-accent hover:underline">
          {t("signUp")}
        </Link>
      </p>
    </Card>
  );
}
