"use client";

/**
 * Client Better Auth per le operazioni che richiedono il browser: le passkey
 * usano WebAuthn, che vive solo lato client e non puo passare da una Server
 * Action.
 */
import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [passkeyClient(), twoFactorClient()],
});

export const { signIn, signOut, useSession } = authClient;
