"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { api, authRequest } from "@/lib/api";
import { fail, ok, runAction, type ActionState } from "@/lib/actions";
import { defaultLocale } from "@/i18n/request";

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Almeno 10 caratteri"),
  invite: z.string().trim().optional(),
});

export type SignUpPolicy = {
  allowed: boolean;
  reason: "first_user" | "invite" | "open" | "closed";
  householdName?: string;
  userCount: number;
};

/** Chi puo registrarsi su questa istanza: lo decide l'API. */
export async function signUpPolicy(inviteToken?: string): Promise<SignUpPolicy> {
  return api.get<SignUpPolicy>("/auth/policy", { invite: inviteToken });
}

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = signInSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) return fail("auth.invalidCredentials");

    const result = await authRequest<{ twoFactorRedirect?: boolean }>("/sign-in/email", {
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (result.status === 429) return fail("auth.tooManyAttempts");
    if (!result.ok) return fail("auth.invalidCredentials");
    // Better Auth segnala cosi la richiesta del secondo fattore.
    if (result.data?.twoFactorRedirect) redirect("/two-factor");

    redirect("/");
  });
}

export async function signUpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = signUpSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      invite: formData.get("invite") ?? undefined,
    });
    if (!parsed.success) {
      return {
        status: "error",
        messageKey: "errors.validation",
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
      };
    }

    // L'API controlla la politica di iscrizione, crea l'utente, accetta
    // l'invito e restituisce il cookie della nuova sessione.
    const result = await authRequest<{ next?: string; code?: string }>(
      "/auth/sign-up",
      { ...parsed.data, invite: parsed.data.invite || undefined, locale: defaultLocale() },
      { v1: true },
    );
    if (!result.ok) {
      return fail(result.data?.code === "signUpClosed" ? "auth.signUpClosed" : "auth.emailInUse");
    }
    redirect(result.data?.next ?? "/onboarding");
  });
}

const totpSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

export async function verifyTotpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = totpSchema.safeParse({ code: formData.get("code") });
    if (!parsed.success) return fail("auth.twoFactorInvalid");

    const result = await authRequest("/two-factor/verify-totp", { code: parsed.data.code });
    if (result.status === 429) return fail("auth.tooManyAttempts");
    if (!result.ok) return fail("auth.twoFactorInvalid");

    redirect("/");
  });
}

/** Avvia l'attivazione del secondo fattore: restituisce l'URI per il QR. */
export async function enableTotpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState & { totpUri?: string; backupCodes?: string[] }> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 1) return fail("auth.invalidCredentials");

  const result = await authRequest<{ totpURI?: string; backupCodes?: string[] }>(
    "/two-factor/enable",
    { password },
  );
  if (!result.ok) return fail("auth.invalidCredentials");
  return { ...ok(), totpUri: result.data?.totpURI, backupCodes: result.data?.backupCodes };
}

export async function disableTotpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const password = String(formData.get("password") ?? "");
    const result = await authRequest("/two-factor/disable", { password });
    if (!result.ok) return fail("auth.invalidCredentials");
    return ok({ messageKey: "settings.passwordChanged" });
  });
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    if (next.length < 10) {
      return { status: "error", messageKey: "errors.validation", fieldErrors: { newPassword: "min" } };
    }
    const result = await authRequest("/change-password", {
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    if (!result.ok) return fail("auth.invalidCredentials");
    return ok({ messageKey: "settings.passwordChanged" });
  });
}
