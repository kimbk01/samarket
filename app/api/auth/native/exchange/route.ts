import { createServerClient } from "@supabase/ssr";
import { after, NextRequest, NextResponse } from "next/server";
import { storeAppleSigninRefreshToken } from "@/lib/auth/native/apple-siwa-token.server";
import { resolveAuthProviderLoginGate } from "@/lib/auth/auth-provider-store";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { parseNativeExchangeRequest } from "@/lib/auth/native/native-exchange-contract.server";
import { invalidNativeExchangeProvider, nativeExchangeBadRequest } from "@/lib/auth/native/native-exchange-errors.server";
import {
  createNativeExchangeContext,
  exchangeNativeProviderToken,
} from "@/lib/auth/native/native-token-exchange.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

function noStoreJson(body: Record<string, unknown>, status: number): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function attachSessionCookies(target: NextResponse, cookiesToSet: CookieToSet[]): void {
  for (const { name, value, options } of cookiesToSet) {
    try {
      target.cookies.set(name, value, options);
    } catch {
      /* ignore malformed cookie options */
    }
  }
}

/**
 * B-3 (2026-11-08 후속 감사) — 로그인 처리(`syncActiveSessionForUser`·탈퇴 회수)가 운반 응답에 쓴 쿠키
 * (`samarket_active_session_id` 설정·삭제)를 최종 응답으로 옮긴다. 이전에는 최종 응답을 새로 만들며 버려졌다.
 */
function carryContextCookies(target: NextResponse, carrier: NextResponse, onlyDeletions: boolean): void {
  for (const cookie of carrier.cookies.getAll()) {
    if (onlyDeletions && !isCookieDeletion(cookie.value, cookie.maxAge)) continue;
    try {
      target.cookies.set(cookie);
    } catch {
      /* ignore malformed cookie options */
    }
  }
}

/** 실패 응답에는 쿠키 「삭제」만 싣는다 — 실패한 로그인이 세션 쿠키를 남기면 안 된다 */
function isCookieDeletion(value: string | undefined, maxAge: number | undefined): boolean {
  return !value || maxAge === 0;
}

function sessionCookieDeletions(cookiesToSet: CookieToSet[]): CookieToSet[] {
  return cookiesToSet.filter(({ value, options }) =>
    isCookieDeletion(value, typeof options?.maxAge === "number" ? (options.maxAge as number) : undefined),
  );
}

/**
 * P2: Native SDK token → server verify → Supabase session.
 * Web OAuth (`/api/auth/oauth/start`) 와 동시 실행 금지 — 클라 `tryBeginOAuthFlow` mutex.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson({ ok: false, errorCode: "native_exchange_bad_request", message: "Invalid JSON" }, 400);
  }

  const parsed = parseNativeExchangeRequest(body);
  if (!parsed) {
    const failure = invalidNativeExchangeProvider();
    return noStoreJson(
      { ok: false, errorCode: failure.errorCode, message: failure.message },
      failure.status,
    );
  }

  // OA-14 — 관리자 OFF 공급자는 서버에서 교환 거부 (naver 항상 거부).
  const gate = await resolveAuthProviderLoginGate(tryCreateSupabaseServiceClient(), parsed.provider);
  if (!gate.allowed) {
    return noStoreJson(
      { ok: false, errorCode: "provider_disabled", message: "This sign-in method is currently disabled." },
      403,
    );
  }

  const safeNext = typeof body.next === "string" ? body.next : null;
  const exchangeInput = { ...parsed, next: safeNext };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return noStoreJson({ ok: false, errorCode: "supabase_unconfigured" }, 501);
  }

  const sessionCookies: CookieToSet[] = [];
  const cookieSecure = cookieSecureFromNextRequest(req);
  const routeSb = createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        sessionCookies.push(...cookiesToSet);
      },
    },
  });

  /** 로그인 처리가 쓰는 쿠키 운반 응답 — 최종 응답으로 옮긴다 (B-3) */
  const cookieCarrier = noStoreJson({ ok: false, errorCode: "pending" }, 500);
  const context = createNativeExchangeContext(req, cookieCarrier, routeSb);

  const result = await exchangeNativeProviderToken(exchangeInput, context);

  if (!result.ok) {
    const body: Record<string, unknown> = {
      ok: false,
      errorCode: result.errorCode,
      message: result.message,
    };
    if (result.conflict) {
      // P1-3 — 다른 회원 userId 는 응답에 싣지 않는다 (필드 화이트리스트).
      body.conflict = {
        email: result.conflict.email,
        attemptedProvider: result.conflict.attemptedProvider,
        existingProviders: result.conflict.existingProviders,
        stashToken: result.conflict.stashToken,
      };
    }
    const failure = noStoreJson(body, result.status);
    // 탈퇴 회수 등 — 쿠키 삭제만 옮긴다 (활성 세션 쿠키 삭제·Supabase 로그아웃)
    attachSessionCookies(failure, sessionCookieDeletions(sessionCookies));
    carryContextCookies(failure, cookieCarrier, true);
    return failure;
  }

  if (result.sessionEstablished !== true) {
    return noStoreJson(
      nativeExchangeBadRequest("Native exchange success must include sessionEstablished=true"),
      500,
    );
  }

  const response = noStoreJson(
    {
      ok: true,
      provider: result.provider,
      signupComplete: result.signupComplete,
      redirectTo: result.redirectTo,
      sessionEstablished: true,
      userId: result.userId,
      isNewUser: result.isNewUser,
      needsProfileCompletion: result.needsProfileCompletion,
      needsTermsAgreement: result.needsTermsAgreement,
    },
    200,
  );
  attachSessionCookies(response, sessionCookies);
  carryContextCookies(response, cookieCarrier, false);

  // App Store 계정 삭제 요구 — 탈퇴 때 폐기할 Apple 토큰을 응답 뒤에 저장 (실패해도 로그인 무영향)
  if (result.provider === "apple" && exchangeInput.authorizationCode && result.userId) {
    const appleUserId = String(result.userId);
    const authorizationCode = exchangeInput.authorizationCode;
    after(async () => {
      const sb = tryCreateSupabaseServiceClient();
      if (!sb) return;
      const stored = await storeAppleSigninRefreshToken(sb, { userId: appleUserId, authorizationCode });
      if (!stored.ok && stored.reason !== "unconfigured") {
        console.warn("[native-exchange] apple token store skipped:", stored.reason);
      }
    });
  }
  return response;
}
