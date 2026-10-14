"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth, userCount } from "@/lib/auth";
import { env } from "@/lib/env";
import { acceptInvite, checkInvite, householdOf } from "@/server/household";
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

/**
 * Chi puo registrarsi su questa istanza.
 *
 * Con `SIGNUP=invite` (impostazione predefinita) solo il primo utente, che
 * diventa owner, e chi ha un link di invito valido: un'istanza esposta su
 * internet non raccoglie estranei.
 */
export async function signUpPolicy(inviteToken?: string): Promise<{
  allowed: boolean;
  reason: "first_user" | "invite" | "open" | "closed";
  householdName?: string;
}> {
  const count = await userCount();
  if (count === 0) return { allowed: true, reason: "first_user" };
  if (env().SIGNUP === "open") return { allowed: true, reason: "open" };
  if (inviteToken) {
    const invite = await checkInvite(inviteToken);
    if (invite.valid) {
      return { allowed: true, reason: "invite", householdName: invite.householdName };
    }
  }
  return { allowed: false, reason: "closed" };
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

    try {
      await auth.api.signInEmail({
        body: { email: parsed.data.email, password: parsed.data.password },
        headers: await headers(),
      });
    } catch (error) {
      if (error instanceof APIError) {
        // Better Auth segnala cosi la richiesta del secondo fattore.
        const body = error.body as { twoFactorRedirect?: boolean } | undefined;
        if (body?.twoFactorRedirect) redirect("/two-factor");
        return fail("auth.invalidCredentials");
      }
      throw error;
    }

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

    const inviteToken = parsed.data.invite || undefined;
    const policy = await signUpPolicy(inviteToken);
    if (!policy.allowed) return fail("auth.signUpClosed");

    // L'utente creato arriva dalla risposta: rileggere la sessione dalle
    // intestazioni della richiesta non funziona, perche il cookie della nuova
    // sessione viene scritto sulla risposta, non su quella richiesta.
    let userId: string;
    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
          locale: defaultLocale(),
        },
        headers: await headers(),
      });
      userId = result.user.id;
    } catch (error) {
      if (error instanceof APIError) return fail("auth.emailInUse");
      throw error;
    }

    if (inviteToken) {
      await acceptInvite(inviteToken, userId);
      redirect("/");
    }

    // Senza invito l'utente crea il proprio household nell'onboarding.
    redirect((await householdOf(userId)) ? "/" : "/onboarding");
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

    try {
      await auth.api.verifyTOTP({
        body: { code: parsed.data.code },
        headers: await headers(),
      });
    } catch (error) {
      if (error instanceof APIError) return fail("auth.twoFactorInvalid");
      throw error;
    }

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

  try {
    const result = await auth.api.enableTwoFactor({
      body: { password },
      headers: await headers(),
    });
    return {
      ...ok(),
      totpUri: (result as { totpURI?: string }).totpURI,
      backupCodes: (result as { backupCodes?: string[] }).backupCodes,
    };
  } catch (error) {
    if (error instanceof APIError) return fail("auth.invalidCredentials");
    throw error;
  }
}

export async function disableTotpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const password = String(formData.get("password") ?? "");
    try {
      await auth.api.disableTwoFactor({ body: { password }, headers: await headers() });
    } catch (error) {
      if (error instanceof APIError) return fail("auth.invalidCredentials");
      throw error;
    }
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
    try {
      await auth.api.changePassword({
        body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch (error) {
      if (error instanceof APIError) return fail("auth.invalidCredentials");
      throw error;
    }
    return ok({ messageKey: "settings.passwordChanged" });
  });
}
