import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  inviteGroupMembers,
  kickGroupMember,
  leaveGroupRoom,
} from "@/lib/community-messenger/group/group-room-service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function groupRoomServiceJsonError(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.BLOCKED_TARGET:
      return jsonError("차단된 사용자와는 대화할 수 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.FRIEND_REQUIRED:
      return jsonError("친구만 그룹에 초대할 수 있습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError("권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_UNAVAILABLE:
      return jsonError("읽기 전용이거나 사용할 수 없는 그룹입니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.TARGET_NOT_FOUND:
      return jsonError("대상 멤버를 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.OWNER_CANNOT_LEAVE:
      return jsonError("방장은 그룹을 나갈 수 없습니다.", 400, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError("그룹 대화 기능을 사용하려면 DB 마이그레이션이 필요합니다.", 503, {
        code: error,
      });
    case GROUP_ROOM_ERROR.MEMBERS_REQUIRED:
      return jsonError("초대할 멤버가 필요합니다.", 400, { code: error });
    case GROUP_ROOM_ERROR.INVALID_TARGET:
    case GROUP_ROOM_ERROR.BAD_TARGET:
      return jsonError("처리할 수 없는 대상입니다.", 400, { code: error });
    default:
      return jsonError("그룹 멤버 요청을 처리하지 못했습니다.", 400, { code: error });
  }
}

/** 멤버 초대 */
export async function POST(
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
    key: `community-messenger:group-participants-invite:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "그룹 초대 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_participants_invite_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ memberIds?: string[] }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("대화방 id가 필요합니다.", 400);

  const result = await inviteGroupMembers({
    userId: auth.userId,
    roomId,
    memberIds: Array.isArray(parsed.value.memberIds) ? parsed.value.memberIds.map(String) : [],
  });
  if (!result.ok) return groupRoomServiceJsonError(result.error ?? GROUP_ROOM_ERROR.INVITE_FAILED);
  return jsonOk({});
}

/** 멤버 추방(userId 쿼리) 또는 본인 나가기 */
export async function DELETE(
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
    key: `community-messenger:group-participants-leave:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "그룹 나가기·추방 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_participants_leave_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("대화방 id가 필요합니다.", 400);

  const targetUserId = trimText(req.nextUrl.searchParams.get("userId"));
  const result = targetUserId
    ? await kickGroupMember({ userId: auth.userId, roomId, targetUserId })
    : await leaveGroupRoom({ userId: auth.userId, roomId });

  if (!result.ok) {
    return groupRoomServiceJsonError(
      result.error ?? (targetUserId ? GROUP_ROOM_ERROR.KICK_FAILED : GROUP_ROOM_ERROR.LEAVE_FAILED)
    );
  }
  return jsonOk({});
}
