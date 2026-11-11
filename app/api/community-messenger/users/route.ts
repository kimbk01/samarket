import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_DAILY_LIMIT,
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  searchCommunityMessengerUsersRanked,
} from "@/lib/community-messenger/user-public-id-search";
import { normalizeProfileUserSearchKeyword } from "@/lib/community-messenger/profile-user-search-filter";
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

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }
  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const query = req.nextUrl.searchParams.get("q") ?? "";

  /**
   * 설계안 v3 §3.3 — 숫자 5자리·4자 부분 검색으로 회원 목록을 긁지 못하게 하루 500회 (필리핀 날짜 기준).
   * 서버 메모리가 아니라 DB 에서 센다 — 운영에 Redis 가 없어 메모리 한도는 서버마다 따로 셈 (후속 F3).
   * 실제로 검색하는 입력(2자 이상)만 센다. DB 가 답하지 못하면 검색은 막지 않는다.
   */
  if (normalizeProfileUserSearchKeyword(query).length >= COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) {
    const { data: quota } = await sb.rpc("member_search_quota_hit", {
      p_user_id: auth.userId,
      p_limit: COMMUNITY_MESSENGER_USER_SEARCH_DAILY_LIMIT,
    });
    if ((quota as { ok?: boolean; allowed?: boolean } | null)?.ok === true && (quota as { allowed?: boolean }).allowed === false) {
      return NextResponse.json(
        { ok: false, error: "community_messenger_users_search_daily_limited", code: "community_messenger_users_search_daily_limited" },
        { status: 429 },
      );
    }
  }

  const users = await searchCommunityMessengerUsersRanked(auth.userId, query);
  return NextResponse.json({ ok: true, users });
}
