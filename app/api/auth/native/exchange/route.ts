import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { parseNativeExchangeRequest } from "@/lib/auth/native/native-exchange-contract.server";
import { invalidNativeExchangeProvider, nativeExchangeBadRequest } from "@/lib/auth/native/native-exchange-errors.server";
import {
  createNativeExchangeContext,
  exchangeNativeProviderToken,
} from "@/lib/auth/native/native-token-exchange.server";

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

  let response = noStoreJson({ ok: false, errorCode: "pending" }, 500);
  const context = createNativeExchangeContext(req, response, routeSb);

  const result = await exchangeNativeProviderToken(exchangeInput, context);

  if (!result.ok) {
    return noStoreJson(
      { ok: false, errorCode: result.errorCode, message: result.message },
      result.status,
    );
  }

  if (result.sessionEstablished !== true) {
    return noStoreJson(
      nativeExchangeBadRequest("Native exchange success must include sessionEstablished=true"),
      500,
    );
  }

  response = noStoreJson(
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
  return response;
}
