"use client";

import type { FinishClientAuthLoginTermsHandoff } from "@/lib/auth/finish-client-auth-login.client";

/**
 * Slice 6-4 Thin Handoff — minimum Completion input from native exchange success.
 *
 * Provider owns: SDK, exchange, server profile/destination cookies.
 * Completion owns: client sync, navigation (via finishClientAuthLogin).
 *
 * DO NOT put profile/destination/sync/navigation side effects here.
 */
export type NativeAuthCompletionHandoff = FinishClientAuthLoginTermsHandoff & {
  redirectTo: string | null;
};

export type NativeExchangeHandoffSource = {
  redirectTo?: string | null;
  needsTermsAgreement?: boolean | null;
  signupComplete?: boolean | null;
  /** Google exchange may mark brand-new auth users — forces terms incomplete handoff. */
  isNewUser?: boolean | null;
};

/**
 * Single Thin Handoff builder for Native Google / Kakao / Apple (and Google recover).
 */
export function buildNativeAuthCompletionHandoff(
  source: NativeExchangeHandoffSource,
): NativeAuthCompletionHandoff {
  const needsTermsAgreement =
    source.isNewUser === true ? true : source.needsTermsAgreement ?? null;
  const signupComplete =
    source.isNewUser === true ? false : source.signupComplete ?? null;

  return {
    redirectTo: source.redirectTo?.trim() ? source.redirectTo.trim() : null,
    needsTermsAgreement,
    signupComplete,
    consentComplete:
      needsTermsAgreement === false || signupComplete === true,
    syncFromNativeExchangeCookies: true,
  };
}
