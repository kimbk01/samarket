import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  isNativeExchangeProvider,
  NATIVE_EXCHANGE_PROVIDERS,
  normalizeNativeExchangeProvider,
  type NativeExchangeProvider,
} from "@/lib/auth/native/native-provider-contract";

export { NATIVE_EXCHANGE_PROVIDERS, type NativeExchangeProvider };
export { isNativeExchangeProvider, normalizeNativeExchangeProvider };

export type NativeExchangeRequest = {
  provider: NativeExchangeProvider;
  /** Generic fallback — provider별 필수 필드는 adapter가 검증 */
  token?: string | null;
  idToken?: string | null;
  accessToken?: string | null;
  /** Apple ASAuthorizationAppleIDCredential identityToken (JWT) */
  identityToken?: string | null;
  authorizationCode?: string | null;
  nonce?: string | null;
  userIdentifier?: string | null;
  next?: string | null;
};

export type VerifiedNativeIdentity = {
  provider: NativeExchangeProvider;
  providerUserId: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  rawClaims?: Record<string, unknown>;
};

export type NativeExchangeSuccess = {
  ok: true;
  provider: NativeExchangeProvider;
  userId: string;
  redirectTo: string;
  signupComplete: boolean;
  sessionEstablished: true;
  isNewUser: boolean;
  needsProfileCompletion: boolean;
  needsTermsAgreement: boolean;
};

export type NativeExchangeFailure = {
  ok: false;
  errorCode: string;
  message: string;
  status: number;
};

export type NativeExchangeResult = NativeExchangeSuccess | NativeExchangeFailure;

export type NativeExchangeContext = {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  request: NextRequest;
  response: NextResponse;
};

/** @deprecated use NativeExchangeContext */
export type NativeTokenExchangeContext = NativeExchangeContext;

/** @deprecated use NativeExchangeRequest */
export type NativeTokenExchangeInput = NativeExchangeRequest;

/** @deprecated use NativeExchangeSuccess */
export type NativeTokenExchangeSuccess = NativeExchangeSuccess;

/** @deprecated use NativeExchangeFailure */
export type NativeTokenExchangeFailure = NativeExchangeFailure;

/** @deprecated use NativeExchangeResult */
export type NativeTokenExchangeResult = NativeExchangeResult;

/** @deprecated use isNativeExchangeProvider */
export function isNativeTokenExchangeProvider(value: string): value is NativeExchangeProvider {
  return isNativeExchangeProvider(value);
}

