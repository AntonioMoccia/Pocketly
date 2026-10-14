/**
 * Iscrizione e preferenze dell'utente. Accesso, secondo fattore, passkey e
 * cambio password sono gli endpoint di Better Auth su `/api/auth/*`; qui c'e
 * solo cio che Better Auth non sa: chi puo iscriversi e gli inviti.
 */
import { Body, Controller, Get, Put, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { env } from "@api/lib/env";
import { DomainError } from "@pocketly/domain/errors";
import { acceptInvite, checkInvite, householdOf, setUserLocale } from "@api/data/household";
import { auth, userCount } from "../../auth/auth";
import { CurrentUser, Public, SessionOnly } from "../../common/guards";
import type { SessionUser } from "../../common/context";

/**
 * Chi puo registrarsi su questa istanza.
 *
 * Con `SIGNUP=invite` (impostazione predefinita) solo il primo utente, che
 * diventa owner, e chi ha un link di invito valido: un'istanza esposta su
 * internet non raccoglie estranei.
 */
async function signUpPolicy(inviteToken?: string): Promise<{
  allowed: boolean;
  reason: "first_user" | "invite" | "open" | "closed";
  householdName?: string;
  userCount: number;
}> {
  const count = await userCount();
  if (count === 0) return { allowed: true, reason: "first_user", userCount: count };
  if (env().SIGNUP === "open") return { allowed: true, reason: "open", userCount: count };
  if (inviteToken) {
    const invite = await checkInvite(inviteToken);
    if (invite.valid) {
      return {
        allowed: true,
        reason: "invite",
        householdName: invite.householdName,
        userCount: count,
      };
    }
  }
  return { allowed: false, reason: "closed", userCount: count };
}

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, "Almeno 10 caratteri"),
  invite: z.string().trim().optional(),
  locale: z.enum(["it", "en"]).optional(),
});

@Controller()
export class AuthController {
  @Public()
  @Get("auth/policy")
  policy(@Query("invite") invite?: string) {
    return signUpPolicy(invite || undefined);
  }

  /**
   * Registrazione: controlla la politica, crea l'utente, accetta l'eventuale
   * invito. Il cookie della nuova sessione torna nella risposta.
   */
  @Public()
  @Post("auth/sign-up")
  async signUp(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = signUpSchema.parse(body);
    const inviteToken = input.invite || undefined;
    const policy = await signUpPolicy(inviteToken);
    if (!policy.allowed) throw new DomainError("signUpClosed");

    let userId: string;
    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: input.name,
          email: input.email,
          password: input.password,
          locale: input.locale ?? env().DEFAULT_LOCALE,
        },
        returnHeaders: true,
      });
      userId = result.response.user.id;
      for (const cookie of result.headers.getSetCookie()) response.append("set-cookie", cookie);
    } catch (error) {
      if (error instanceof APIError) throw new DomainError("emailInUse");
      throw error;
    }

    if (inviteToken) {
      await acceptInvite(inviteToken, userId);
      return { next: "/" };
    }
    // Senza invito l'utente crea il proprio household nell'onboarding.
    return { next: (await householdOf(userId)) ? "/" : "/onboarding" };
  }

  /** Lingua del profilo, usata ai prossimi accessi. */
  @SessionOnly()
  @Put("me/locale")
  async setLocale(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const { locale } = z.object({ locale: z.enum(["it", "en"]) }).parse(body);
    await setUserLocale(user.id, locale);
  }
}
