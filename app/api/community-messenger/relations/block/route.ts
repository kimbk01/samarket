import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { blockUserSocial, unblockUserSocial } from "@/lib/community-messenger/social-relations";
import { cleanupCommunityMessengerFriendGraphOnBlock } from "@/lib/community-messenger/service";
import {
  hideDirectRoomsOnBlockForViewer,
  restoreDirectRoomsOnUnblockForViewer,
} from "@/lib/community-messenger/participant-block-hide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseBlockBody(req: NextRequest): Promise<{
  targetUserId: string | null;
  roomId: string | null;
  blockSource: "chat_room" | "incoming_call" | "profile" | "call_log" | "friend_list" | null;
}> {
  let body: { targetUserId?: string; roomId?: string; blockSource?: string };
  try {
    body = await req.json();
  } catch {
    return { targetUserId: null, roomId: null, blockSource: null };
  }
  const rawSource = String(body.blockSource ?? "").trim();
  const blockSource =
    rawSource === "chat_room" ||
    rawSource === "incoming_call" ||
    rawSource === "profile" ||
    rawSource === "call_log" ||
    rawSource === "friend_list"
      ? rawSource
      : null;
  return {
    targetUserId: String(body.targetUserId ?? "").trim() || null,
    roomId: String(body.roomId ?? "").trim() || null,
    blockSource,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:relation-block:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "차단 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_relation_block_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { targetUserId, roomId, blockSource } = await parseBlockBody(req);
  if (!targetUserId || targetUserId === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  const result = await blockUserSocial(auth.userId, targetUserId, {
    blockSource: blockSource ?? (roomId ? "chat_room" : "profile"),
  });
  if (result.ok) {
    await cleanupCommunityMessengerFriendGraphOnBlock(auth.userId, targetUserId);
    const hide = await hideDirectRoomsOnBlockForViewer({
      viewerUserId: auth.userId,
      peerUserId: targetUserId,
      roomId: roomId ?? undefined,
    });
    if (!hide.ok) {
      return NextResponse.json({ ...result, blocked: true, hideError: hide.error }, { status: 200 });
    }
    return NextResponse.json({ ...result, blocked: true, hiddenRoomIds: hide.hiddenRoomIds }, { status: 200 });
  }
  return NextResponse.json({ ...result, blocked: true }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:relation-unblock:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "차단 해제 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_relation_unblock_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { targetUserId } = await parseBlockBody(req);
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  const result = await unblockUserSocial(auth.userId, targetUserId);
  if (result.ok) {
    const restore = await restoreDirectRoomsOnUnblockForViewer(auth.userId, targetUserId);
    return NextResponse.json(
      { ...result, blocked: false, restoredRoomIds: restore.restoredRoomIds },
      { status: 200 }
    );
  }
  return NextResponse.json({ ...result, blocked: false }, { status: 400 });
}
