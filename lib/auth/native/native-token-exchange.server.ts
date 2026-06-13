import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  nativeExchangeSessionUnavailable,
  nativeProviderNotImplemented,
} from "@/lib/auth/native/native-exchange-errors.server";
import type {
  NativeExchangeContext,
  NativeExchangeFailure,
  NativeExchangeRequest,
  NativeExchangeResult,
  NativeTokenExchangeContext,
  NativeTokenExchangeInput,
  NativeTokenExchangeResult,
  VerifiedNativeIdentity,
} from "@/lib/auth/native/native-exchange-types.server";
import {
  isNativeExchangeProvider,
  isNativeTokenExchangeProvider,
  NATIVE_EXCHANGE_PROVIDERS,
  normalizeNativeExchangeProvider,
} from "@/lib/auth/native/native-exchange-types.server";
import { getNativeProviderAdapter } from "@/lib/auth/native/native-provider-adapter.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type {
  NativeExchangeContext,
  NativeExchangeFailure,
  NativeExchangeProvider,
  NativeExchangeRequest,
  NativeExchangeResult,
  NativeExchangeSuccess,
  NativeTokenExchangeContext,
  NativeTokenExchangeFailure,
  NativeTokenExchangeInput,
  NativeTokenExchangeResult,
  NativeTokenExchangeSuccess,
  VerifiedNativeIdentity,
} from "@/lib/auth/native/native-exchange-types.server";

export {
  isNativeExchangeProvider,
  isNativeTokenExchangeProvider,
  NATIVE_EXCHANGE_PROVIDERS,
  normalizeNativeExchangeProvider,
};

function isExchangeFailure(
  value: VerifiedNativeIdentity | NativeExchangeFailure,
): value is NativeExchangeFailure {
  return "ok" in value && value.ok === false;
}

/**
 * P2: provider SDK token → adapter verify → Supabase session.
 * Stub provider (Facebook) → 501 after credential validation.
 * Kakao/Apple/Google → adapter verify + establishSession.
 */
export async function exchangeNativeProviderToken(
  input: NativeExchangeRequest | NativeTokenExchangeInput,
  context: NativeExchangeContext | NativeTokenExchangeContext | null = null,
): Promise<NativeExchangeResult | NativeTokenExchangeResult> {
  const adapter = getNativeProviderAdapter(input.provider);

  const validationError = adapter.validateInput(input);
  if (validationError) return validationError;

  if (adapter.stub) {
    return nativeProviderNotImplemented(input.provider);
  }

  const verified = await adapter.verify(input);
  if (isExchangeFailure(verified)) return verified;

  if (!context?.adminSb || !context.routeSb) {
    return nativeExchangeSessionUnavailable(
      `${input.provider} native session exchange requires Supabase service role`,
    );
  }

  return adapter.establishSession(verified, context, input);
}

export function createNativeExchangeContext(
  req: NextRequest,
  response: NextResponse,
  routeSb: SupabaseClient,
): NativeExchangeContext | null {
  const adminSb = tryCreateSupabaseServiceClient();
  if (!adminSb) return null;
  return { adminSb, routeSb, request: req, response };
}
