import { NextRequest, NextResponse } from "next/server";
import {
  buildNaverAuthorizeUrl,
  buildNaverState,
  NAVER_OAUTH_STATE_COOKIE,
} from "@/lib/auth/naver-oauth";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/capacitor-oauth-return";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { DIBAY_APP_MARKER_COOKIE_NAME, DIBAY_APP_MARKER_PARAM } from "@/lib/platform/capacitor-native";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNativeAppRequest(req: NextRequest): boolean {
  const marker =
    req.nextUrl.searchParams.get(DIBAY_APP_MARKER_PARAM) ??
    req.cookies.get(DIBAY_APP_MARKER_COOKIE_NAME)?.value ??
    "";
  const normalized = marker.trim().toLowerCase();
  return normalized === "android" || normalized === "ios";
}

function buildNaverRedirectUri(req: NextRequest, safeNext: string | null): string {
  if (!isNativeAppRequest(req)) {
    return new URL("/api/auth/naver/callback", req.url).toString();
  }

  const callback = new URL(NATIVE_OAUTH_CALLBACK_URL);
  callback.searchParams.set("provider", "naver");
  if (safeNext) callback.searchParams.set("next", safeNext);
  return callback.toString();
}

export async function GET(req: NextRequest) {
  const clientId = process.env.NAVER_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "naver_oauth_client_id_missing" }, { status: 503 });
  }
  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
  const state = buildNaverState(safeNext ?? null);
  const callbackUrl = buildNaverRedirectUri(req, safeNext);
  const authorizeUrl = buildNaverAuthorizeUrl({
    clientId,
    redirectUri: callbackUrl,
    state,
  });
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(NAVER_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecureFromNextRequest(req),
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
