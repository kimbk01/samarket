import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { unblockCommunityMessengerFriendship } from "@/lib/community-messenger/service";
import { restoreDirectRoomsOnUnblockForViewer } from "@/lib/community-messenger/participant-block-hide";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friendship-unblock:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "차단 해제 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friendship_unblock_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;
  let body: { targetUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const targetUserId = String(body.targetUserId ?? "").trim();
  const result = await unblockCommunityMessengerFriendship(auth.userId, targetUserId);
  if (result.ok) {
    const restore = await restoreDirectRoomsOnUnblockForViewer(auth.userId, targetUserId);
    return NextResponse.json({ ...result, restoredRoomIds: restore.restoredRoomIds ?? [] }, { status: 200 });
  }
  return NextResponse.json(result, { status: 400 });
}
