import { NextRequest, NextResponse } from "next/server";
import {
  buildNaverAuthorizeUrl,
  buildNaverState,
  NAVER_OAUTH_STATE_COOKIE,
} from "@/lib/auth/naver-oauth";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NATIVE_OAUTH_CALLBACK_URL = "dibay://auth/callback";

function isNativeAppRequestForNaver(req: NextRequest): boolean {
  const marker = req.nextUrl.searchParams.get("dibay_app")?.trim().toLowerCase();
  if (marker === "android" || marker === "ios") return true;
  const cookieMarker = req.cookies.get("dibay_app")?.value?.trim().toLowerCase();
  return cookieMarker === "android" || cookieMarker === "ios";
}

function buildNaverRedirectUri(req: NextRequest, safeNext: string | null): string {
  if (!isNativeAppRequestForNaver(req)) {
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
