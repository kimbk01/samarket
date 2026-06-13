/**
 * DIBAY Native Provider Contract — client · server 공통 shape.
 * Provider SDK → credential → POST /api/auth/native/exchange → sessionEstablished.
 */

export const NATIVE_EXCHANGE_PROVIDERS = ["google", "kakao", "apple", "facebook"] as const;

export type NativeExchangeProvider = (typeof NATIVE_EXCHANGE_PROVIDERS)[number];

/** Native SDK sign-in 결과 credential (클라 → 서버 exchange) */
export type NativeProviderCredential = {
  accessToken?: string;
  idToken?: string;
  identityToken?: string;
  authorizationCode?: string;
  nonce?: string;
  email?: string;
  providerUserId?: string;
};

export type NativeProviderLoginSuccess = {
  ok: true;
  provider: NativeExchangeProvider;
} & NativeProviderCredential;

export type NativeProviderLoginFailure = {
  ok: false;
  provider: NativeExchangeProvider;
  errorCode: string;
  message?: string;
};

export type NativeProviderLoginResult = NativeProviderLoginSuccess | NativeProviderLoginFailure;

/** POST /api/auth/native/exchange request */
export type NativeExchangeRequest = {
  provider: NativeExchangeProvider;
  accessToken?: string;
  idToken?: string;
  identityToken?: string;
  authorizationCode?: string;
  nonce?: string;
  userIdentifier?: string;
  next?: string | null;
};

/** POST /api/auth/native/exchange success response */
export type NativeExchangeSuccessResponse = {
  ok: true;
  provider: NativeExchangeProvider;
  sessionEstablished: true;
  redirectTo: string;
  signupComplete: boolean;
  isNewUser: boolean;
  needsProfileCompletion: boolean;
  needsTermsAgreement: boolean;
  userId: string;
};

export type NativeExchangeFailureResponse = {
  ok: false;
  errorCode: string;
  message?: string;
};

export type NativeExchangeResponse = NativeExchangeSuccessResponse | NativeExchangeFailureResponse;

/** STEP C+ Kakao · Apple · Google(Android) — Facebook 는 exchange stub */
export const NATIVE_SDK_IMPLEMENTED_PROVIDERS = ["kakao", "apple", "google"] as const;

export type NativeSdkImplementedProvider = (typeof NATIVE_SDK_IMPLEMENTED_PROVIDERS)[number];

const NATIVE_EXCHANGE_PROVIDER_SET = new Set<string>(NATIVE_EXCHANGE_PROVIDERS);

export function isNativeExchangeProvider(value: string): value is NativeExchangeProvider {
  return NATIVE_EXCHANGE_PROVIDER_SET.has(value);
}

export function normalizeNativeExchangeProvider(raw: unknown): NativeExchangeProvider | null {
  const provider = String(raw ?? "").trim().toLowerCase();
  return isNativeExchangeProvider(provider) ? provider : null;
}

export function isNativeSdkImplementedProvider(
  provider: NativeExchangeProvider,
): provider is NativeSdkImplementedProvider {
  return provider === "kakao" || provider === "apple" || provider === "google";
}

export type NativeExchangeGateInput = {
  consentComplete: boolean;
  dibayIdComplete: boolean;
  profileComplete: boolean;
  signupComplete: boolean;
};

export function deriveNativeExchangeGateFlags(input: NativeExchangeGateInput): {
  needsTermsAgreement: boolean;
  needsProfileCompletion: boolean;
} {
  return {
    needsTermsAgreement: !input.consentComplete,
    needsProfileCompletion:
      input.consentComplete && (!input.dibayIdComplete || !input.profileComplete),
  };
}

/** Capacitor 앱 셸 — Custom Tab / Web OAuth fallback 금지 대상 */
export function shouldBlockLegacyOAuthOnNativeApp(
  provider: string,
  isNativeApp: boolean,
): boolean {
  if (!isNativeApp) return false;
  const normalized = String(provider ?? "").trim().toLowerCase();
  if (normalized === "naver") return false;
  return (
    normalized === "google"
    || normalized === "kakao"
    || normalized === "apple"
    || normalized === "facebook"
  );
}
