import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveCommunityMessengerFriendshipStatus } from "@/lib/community-messenger/friendship";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friendship-status:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friendship_status_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  const peerUserId = String(req.nextUrl.searchParams.get("peerUserId") ?? "").trim();
  if (!peerUserId) {
    return NextResponse.json({ ok: false, error: "bad_peer" }, { status: 400 });
  }
  const state = await resolveCommunityMessengerFriendshipStatus({
    viewerUserId: auth.userId,
    peerUserId,
  });
  return NextResponse.json({
    ok: true,
    friendshipId: state.friendshipId,
    friendshipStatus: state.friendshipStatus,
    relationshipStatus: state.status,
    canMessage: state.canMessage,
    canCall: state.canCall,
    canAddFriend: state.canAddFriend,
    isBlockedByMe: state.isBlockedByMe,
    isBlockingMe: state.isBlockedByPeer,
    readdBlockedUntil: state.readdBlockedUntil,
  });
}
