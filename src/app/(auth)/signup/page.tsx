import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { signUpPolicy } from "@/app/actions/auth";
import { Alert, Card } from "@/components/ui";
import { SignUpForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crea account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const session = await getSession();
  if (session?.user) redirect("/");

  const t = await getTranslations("auth");
  const { invite } = await searchParams;
  const policy = await signUpPolicy(invite);

  return (
    <Card className="p-6">
      <h1 className="text-xl font-bold text-ink">{t("signUpTitle")}</h1>

      {policy.reason === "first_user" ? (
        <Alert tone="accent" className="mt-4">
          {t("signUpFirstUser")}
        </Alert>
      ) : policy.reason === "invite" ? (
        <Alert tone="good" className="mt-4">
          {t("signUpInvitedTo", { household: policy.householdName ?? "" })}
        </Alert>
      ) : null}

      {policy.allowed ? (
        <SignUpForm invite={invite} />
      ) : (
        <Alert tone="warning" className="mt-4">
          {t("signUpClosed")}
        </Alert>
      )}

      <p className="mt-5 text-center text-sm text-ink-secondary">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </Card>
  );
}
