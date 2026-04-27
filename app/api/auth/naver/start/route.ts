import { NextRequest, NextResponse } from "next/server";
import {
  buildNaverAuthorizeUrl,
  buildNaverState,
  NAVER_OAUTH_STATE_COOKIE,
} from "@/lib/auth/naver-oauth";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = process.env.NAVER_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "naver_oauth_client_id_missing" }, { status: 503 });
  }
  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));
  const state = buildNaverState(safeNext ?? null);
  const callbackUrl = new URL("/api/auth/naver/callback", req.url).toString();
  const authorizeUrl = buildNaverAuthorizeUrl({
    clientId,
    redirectUri: callbackUrl,
    state,
  });
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(NAVER_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
