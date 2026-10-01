/**
 * Kakao login product intent SSOT.
 *
 * NORMAL — convenience (Android may use KakaoTalk one-tap).
 * OTHER_ACCOUNT — explicit interactive Kakao Account path; MUST NOT use Talk-first.
 *
 * Same USER INTENT across platforms; implementation may differ (native SDK vs Web OAuth).
 */

export const KAKAO_LOGIN_INTENTS = ["normal", "other_account"] as const;

export type KakaoLoginIntent = (typeof KAKAO_LOGIN_INTENTS)[number];

export const KAKAO_LOGIN_INTENT_NORMAL: KakaoLoginIntent = "normal";
export const KAKAO_LOGIN_INTENT_OTHER_ACCOUNT: KakaoLoginIntent = "other_account";

export function normalizeKakaoLoginIntent(raw: unknown): KakaoLoginIntent {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "other_account" || value === "other-account" || value === "reauth") {
    return KAKAO_LOGIN_INTENT_OTHER_ACCOUNT;
  }
  return KAKAO_LOGIN_INTENT_NORMAL;
}

export function isKakaoOtherAccountIntent(intent: KakaoLoginIntent): boolean {
  return intent === KAKAO_LOGIN_INTENT_OTHER_ACCOUNT;
}

/** Android Native SDK dispatch — never infer again in Java beyond this policy. */
export type KakaoNativeSignInPolicy = {
  intent: KakaoLoginIntent;
  /** When true, may call loginWithKakaoTalk first. OTHER_ACCOUNT must be false. */
  preferKakaoTalk: boolean;
  /**
   * Account-path Prompt passed to loginWithKakaoAccount.
   * OTHER_ACCOUNT: LOGIN (force interactive ID screen; SELECT_ACCOUNT alone can auto-complete).
   * NORMAL fallback Account: none (preserve prior convenience fallback).
   */
  accountPrompt: "login" | null;
};

export function resolveKakaoNativeSignInPolicy(intent: KakaoLoginIntent): KakaoNativeSignInPolicy {
  if (isKakaoOtherAccountIntent(intent)) {
    return {
      intent: KAKAO_LOGIN_INTENT_OTHER_ACCOUNT,
      preferKakaoTalk: false,
      accountPrompt: "login",
    };
  }
  return {
    intent: KAKAO_LOGIN_INTENT_NORMAL,
    preferKakaoTalk: true,
    accountPrompt: null,
  };
}

/**
 * Web / iOS Supabase OAuth prompt for Kakao.
 * Both intents use prompt=login (force Kakao Account ID screen).
 * SELECT_ACCOUNT is intentionally not used — proven to auto-complete a single browser session.
 */
export function resolveKakaoWebOAuthPrompt(_intent: KakaoLoginIntent): "login" {
  return "login";
}

export function kakaoLoginIntentLogPayload(intent: KakaoLoginIntent): {
  kakaoLoginIntent: KakaoLoginIntent;
  preferKakaoTalk: boolean;
  accountPrompt: "login" | null;
} {
  const policy = resolveKakaoNativeSignInPolicy(intent);
  return {
    kakaoLoginIntent: policy.intent,
    preferKakaoTalk: policy.preferKakaoTalk,
    accountPrompt: policy.accountPrompt,
  };
}
