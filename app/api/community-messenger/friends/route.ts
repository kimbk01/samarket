import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { listCommunityMessengerFriendsFromSsot } from "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot";
import { getCommunityMessengerSelfProfile } from "@/lib/community-messenger/service";
import { listPeerIdsWhoRejectedMyFriendRequest } from "@/lib/community-messenger/social-relations";

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

  const [result, me, rejectedByPeerIds] = await Promise.all([
    listCommunityMessengerFriendsFromSsot(auth.userId),
    getCommunityMessengerSelfProfile(auth.userId).catch(() => null),
    /** §15-3: 목록 「대화·통화 불가」 배지 — 내 요청을 거절한 상대. null = 모름 */
    listPeerIdsWhoRejectedMyFriendRequest(auth.userId).catch(() => null),
  ]);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "friends_list_unavailable",
        code: result.code,
      },
      { status: result.code === "unavailable" ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, friends: result.friends, me, rejectedByPeerIds });
}
