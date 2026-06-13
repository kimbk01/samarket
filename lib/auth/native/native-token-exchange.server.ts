import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { establishAppleNativeSession } from "@/lib/auth/native/apple-native-session.server";
import {
  AppleTokenVerifyError,
  mapAppleVerifyErrorToHttp,
  verifyAppleIdentityToken,
} from "@/lib/auth/native/apple-token-verify.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type NativeTokenExchangeInput = {
  provider: "apple" | "kakao";
  idToken?: string | null;
  /** Apple ASAuthorizationAppleIDCredential identityToken (JWT) */
  identityToken?: string | null;
  accessToken?: string | null;
  authorizationCode?: string | null;
  nonce?: string | null;
  /** Apple user identifier — must match verified sub when present */
  userIdentifier?: string | null;
  next?: string | null;
};

export type NativeTokenExchangeSuccess = {
  ok: true;
  provider: "apple";
  userId: string;
  redirectTo: string;
  signupComplete: boolean;
  sessionEstablished: true;
};

export type NativeTokenExchangeFailure = {
  ok: false;
  errorCode: string;
  message: string;
  status: number;
};

export type NativeTokenExchangeResult = NativeTokenExchangeSuccess | NativeTokenExchangeFailure;

export type NativeTokenExchangeContext = {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  request: NextRequest;
  response: NextResponse;
};

const NATIVE_EXCHANGE_PROVIDERS = new Set<NativeTokenExchangeInput["provider"]>(["apple", "kakao"]);

export function isNativeTokenExchangeProvider(
  value: string,
): value is NativeTokenExchangeInput["provider"] {
  return NATIVE_EXCHANGE_PROVIDERS.has(value as NativeTokenExchangeInput["provider"]);
}

function missingTokenError(provider: NativeTokenExchangeInput["provider"]): NativeTokenExchangeFailure {
  return {
    ok: false,
    errorCode: "native_token_missing",
    message: `${provider} native token is required`,
    status: 400,
  };
}

function notImplementedError(provider: string): NativeTokenExchangeFailure {
  return {
    ok: false,
    errorCode: "native_exchange_not_implemented",
    message: `${provider} native SDK token exchange is not implemented`,
    status: 501,
  };
}

async function exchangeAppleNativeToken(
  input: NativeTokenExchangeInput,
  context: NativeTokenExchangeContext | null,
): Promise<NativeTokenExchangeResult> {
  const identityToken = String(input.identityToken ?? input.idToken ?? "").trim();
  if (!identityToken) return missingTokenError("apple");

  let verified;
  try {
    verified = await verifyAppleIdentityToken({
      identityToken,
      expectedNonce: input.nonce,
    });
  } catch (error) {
    if (error instanceof AppleTokenVerifyError) {
      const mapped = mapAppleVerifyErrorToHttp(error);
      return {
        ok: false,
        errorCode: mapped.errorCode,
        message: mapped.message,
        status: mapped.status,
      };
    }
    return {
      ok: false,
      errorCode: "apple_token_verify_failed",
      message: "Apple identity token verification failed",
      status: 401,
    };
  }

  if (!context?.adminSb || !context.routeSb) {
    return {
      ok: false,
      errorCode: "native_exchange_not_implemented",
      message: "Apple native session exchange requires Supabase service role",
      status: 501,
    };
  }

  const session = await establishAppleNativeSession(context, {
    verified,
    userIdentifier: input.userIdentifier,
    next: input.next,
  });
  if (!session.ok) {
    return session;
  }

  return {
    ok: true,
    provider: "apple",
    userId: session.userId,
    redirectTo: session.redirectTo,
    signupComplete: session.signupComplete,
    sessionEstablished: true,
  };
}

/**
 * P2: provider SDK token → server verify → Supabase session.
 * Apple: JWKS verify + Admin user + signInWithPassword (Naver 패턴).
 */
export async function exchangeNativeProviderToken(
  input: NativeTokenExchangeInput,
  context: NativeTokenExchangeContext | null = null,
): Promise<NativeTokenExchangeResult> {
  if (input.provider === "apple") {
    return exchangeAppleNativeToken(input, context);
  }

  if (input.provider === "kakao") {
    const token = String(input.accessToken ?? input.idToken ?? "").trim();
    if (!token) return missingTokenError("kakao");
    return notImplementedError("kakao");
  }

  return notImplementedError(String(input.provider));
}

export function normalizeNativeExchangeProvider(
  raw: unknown,
): NativeTokenExchangeInput["provider"] | null {
  const provider = String(raw ?? "").trim().toLowerCase();
  if (provider === "apple" || provider === "kakao") return provider;
  return null;
}

export function createNativeExchangeContext(
  req: NextRequest,
  response: NextResponse,
  routeSb: SupabaseClient,
): NativeTokenExchangeContext | null {
  const adminSb = tryCreateSupabaseServiceClient();
  if (!adminSb) return null;
  return { adminSb, routeSb, request: req, response };
}
