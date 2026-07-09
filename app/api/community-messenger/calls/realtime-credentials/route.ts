import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { getOptionalRouteHandlerCookieAuth } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  CALL_REALTIME_CREDENTIALS_RATE_LIMIT,
  CALL_REALTIME_CREDENTIALS_RATE_LIMIT_CODE,
  CALL_REALTIME_CREDENTIALS_RATE_LIMIT_KEY_PREFIX,
  mintCommunityMessengerCallRealtimeCredentials,
} from "@/lib/community-messenger/call-realtime-credentials.server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REALTIME_CRED_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `${CALL_REALTIME_CREDENTIALS_RATE_LIMIT_KEY_PREFIX}${getRateLimitKey(req, auth.userId)}`,
    limit: CALL_REALTIME_CREDENTIALS_RATE_LIMIT.limit,
    windowMs: CALL_REALTIME_CREDENTIALS_RATE_LIMIT.windowMs,
    message: "Realtime 인증 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: CALL_REALTIME_CREDENTIALS_RATE_LIMIT_CODE,
  });
  if (!rateLimit.ok) return rateLimit.response;

  const cookieAuth = await getOptionalRouteHandlerCookieAuth();
  const minted = await mintCommunityMessengerCallRealtimeCredentials(cookieAuth.supabase);
  if (!minted.ok) {
    return NextResponse.json(
      { ok: false, error: minted.error },
      { status: 503, headers: REALTIME_CRED_HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      accessToken: minted.accessToken,
      expiresAt: minted.expiresAt,
    },
    { headers: REALTIME_CRED_HEADERS }
  );
}
