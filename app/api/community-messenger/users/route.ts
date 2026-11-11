import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_DAILY_LIMIT,
  searchCommunityMessengerUsersRanked,
} from "@/lib/community-messenger/user-public-id-search";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:users-search:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "친구 검색 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_users_search_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  /** 설계안 v3 §3.3 — 숫자 5자리·4자 부분 검색으로 회원 목록을 긁지 못하게 하루 500회 */
  const dailyLimit = await enforceRateLimit({
    key: `community-messenger:users-search-daily:${getRateLimitKey(req, auth.userId)}`,
    limit: COMMUNITY_MESSENGER_USER_SEARCH_DAILY_LIMIT,
    windowMs: 86_400_000,
    code: "community_messenger_users_search_daily_limited",
  });
  if (!dailyLimit.ok) return dailyLimit.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }
  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const query = req.nextUrl.searchParams.get("q") ?? "";
  const users = await searchCommunityMessengerUsersRanked(auth.userId, query);
  return NextResponse.json({ ok: true, users });
}
