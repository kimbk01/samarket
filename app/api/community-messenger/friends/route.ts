import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";
import { isMessengerSocialGraphReadError } from "@/lib/community-messenger/friendship/social-graph-read-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friends-list:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "친구 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friends_list_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  try {
    const friends = await listCommunityMessengerFriendsFromSsot(auth.userId);
    return NextResponse.json({ ok: true, friends });
  } catch (error) {
    /** F-11 — 조회 오류를 빈 목록(200)으로 내보내지 않는다. 클라이언트는 !ok 면 기존 목록 유지 */
    if (isMessengerSocialGraphReadError(error)) {
      return NextResponse.json({ ok: false, error: "friends_list_unavailable" }, { status: 503 });
    }
    throw error;
  }
}
