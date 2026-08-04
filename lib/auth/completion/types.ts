/**
 * DIBAY Common Auth Completion Pipeline — Slice 2-1 core types.
 *
 * Provider Adapter stops at credential/subject.
 * Everything after uses these stage owners (one each).
 *
 * CONTRACT / DO NOT:
 * - Dual-run old completion helpers alongside this pipeline for the same request
 * - Provider Adapter must not import profile/onboarding/navigation from here until cutover
 * - Auth Entry 440ms UI is Slice 2-6 — interim interaction_ready is after single navigation
 */

export const COMMON_AUTH_COMPLETION_STAGE = {
  identity: "CommonIdentityResolution",
  session: "CommonSessionEstablishment",
  clientSync: "CommonClientSessionSync",
  profile: "CommonProfileResolution",
  onboarding: "CommonOnboardingResolution",
  destination: "CommonDestinationResolution",
  entry440: "CommonAuthEntry440ms",
  interactionReady: "interaction_ready",
} as const;

export type CommonAuthCompletionStage =
  (typeof COMMON_AUTH_COMPLETION_STAGE)[keyof typeof COMMON_AUTH_COMPLETION_STAGE];

/** Single owner symbols — contract tests assert these strings stay the authority map. */
export const COMMON_AUTH_COMPLETION_OWNERS = {
  routing: "resolveOAuthNativeRoutingDecision",
  credential: "ProviderAdapter",
  identity: "resolveProviderLogin+user_auth_identities",
  session: "CommonSessionEstablishment",
  cookie: "SSR_Set-Cookie+wipeSupabaseAuthCookies",
  clientSync: "syncCommonClientSessionAfterAuth",
  profile: "ensureAuthProfileForLogin",
  onboarding: "resolvePostLoginRoute",
  destination: "resolveCommonAuthDestination",
  navigation: "runCommonAuthClientCompletion",
  authPhase: "auth-lifecycle-trace",
  entry440: "CommonAuthEntry440ms_SLICE_2_6",
} as const;

/**
 * Adapter output only — no profile/nav fields.
 * Full ProviderResult wiring lands in Slice 2-2+.
 */
export type CommonProviderAuthResult = {
  provider: "google" | "kakao" | "apple" | "email";
  providerUserId: string;
  emailHint?: string | null;
};

/** Interim until Slice 2-6 Auth Entry 440ms. */
export type InteractionReadyPolicy = "after_single_navigation_interim";

export const INTERACTION_READY_POLICY: InteractionReadyPolicy = "after_single_navigation_interim";
