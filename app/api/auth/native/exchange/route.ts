import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { parseNativeAppleExchangeBody } from "@/lib/auth/native/native-apple-auth-contract";
import {
  createNativeExchangeContext,
  exchangeNativeProviderToken,
  normalizeNativeExchangeProvider,
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
    return noStoreJson({ ok: false, errorCode: "invalid_json" }, 400);
  }

  const provider = normalizeNativeExchangeProvider(body.provider);
  if (!provider) {
    return noStoreJson({ ok: false, errorCode: "invalid_provider" }, 400);
  }

  const appleBody = provider === "apple" ? parseNativeAppleExchangeBody(body) : null;
  if (provider === "apple" && !appleBody) {
    return noStoreJson({ ok: false, errorCode: "native_token_missing" }, 400);
  }

  const safeNext = typeof body.next === "string" ? body.next : null;

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

  const result = await exchangeNativeProviderToken(
    {
      provider,
      idToken: appleBody?.identityToken ?? (typeof body.idToken === "string" ? body.idToken : null),
      identityToken: appleBody?.identityToken ?? null,
      accessToken: typeof body.accessToken === "string" ? body.accessToken : null,
      authorizationCode:
        appleBody?.authorizationCode
        ?? (typeof body.authorizationCode === "string" ? body.authorizationCode : null),
      nonce: appleBody?.nonce ?? (typeof body.nonce === "string" ? body.nonce : null),
      userIdentifier: appleBody?.userIdentifier ?? (typeof body.userIdentifier === "string" ? body.userIdentifier : null),
      next: safeNext,
    },
    context,
  );

  if (!result.ok) {
    return noStoreJson(
      { ok: false, errorCode: result.errorCode, message: result.message },
      result.status,
    );
  }

  response = noStoreJson(
    {
      ok: true,
      provider: result.provider,
      signupComplete: result.signupComplete,
      redirectTo: result.redirectTo,
      sessionEstablished: result.sessionEstablished,
    },
    200,
  );
  attachSessionCookies(response, sessionCookies);
  return response;
}
