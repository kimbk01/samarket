import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  getGroupRoomPinnedMessage,
  pinGroupRoomMessage,
  unpinGroupRoomMessage,
} from "@/lib/community-messenger/group/group-room-pin-service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function groupRoomServiceJsonError(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError("권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    default:
      return jsonError("공지를 설정하지 못했습니다.", 400, { code: error });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;
  const { roomId } = await params;
  const result = await getGroupRoomPinnedMessage({ userId: auth.userId, roomId: roomId.trim() });
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({ ok: true, messageId: result.messageId });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-room-pin:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "공지 설정 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_room_pin_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ messageId?: string | null }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const { roomId } = await params;
  const rid = roomId.trim();
  const messageId = typeof parsed.value.messageId === "string" ? parsed.value.messageId.trim() : null;
  if (!messageId) {
    const result = await unpinGroupRoomMessage({ userId: auth.userId, roomId: rid });
    if (!result.ok) return groupRoomServiceJsonError(result.error);
    return jsonOk({ ok: true, messageId: null });
  }
  const result = await pinGroupRoomMessage({ userId: auth.userId, roomId: rid, messageId });
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({ ok: true, messageId: result.messageId });
}
