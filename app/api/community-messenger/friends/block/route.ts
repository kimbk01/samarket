import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { blockCommunityMessengerFriendship } from "@/lib/community-messenger/service";
import { hideDirectRoomsOnBlockForViewer } from "@/lib/community-messenger/participant-block-hide";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friendship-block:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "차단 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friendship_block_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  let body: { targetUserId?: string; roomId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const targetUserId = String(body.targetUserId ?? "").trim();
  const roomId = String(body.roomId ?? "").trim() || undefined;
  const result = await blockCommunityMessengerFriendship(auth.userId, targetUserId);
  if (result.ok) {
    const hide = await hideDirectRoomsOnBlockForViewer({
      viewerUserId: auth.userId,
      peerUserId: targetUserId,
      roomId,
    });
    return NextResponse.json({ ...result, hiddenRoomIds: hide.hiddenRoomIds ?? [] }, { status: 200 });
  }
  return NextResponse.json(result, { status: 400 });
}
