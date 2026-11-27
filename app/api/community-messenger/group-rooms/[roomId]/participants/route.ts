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
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.FRIEND_REQUIRED:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.USER_BANNED:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_UNAVAILABLE:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError(error, 404, { code: error });
    case GROUP_ROOM_ERROR.TARGET_NOT_FOUND:
      return jsonError(error, 404, { code: error });
    case GROUP_ROOM_ERROR.OWNER_CANNOT_LEAVE:
      return jsonError(error, 400, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError(error, 503, {
        code: error,
      });
    case GROUP_ROOM_ERROR.MEMBERS_REQUIRED:
      return jsonError(error, 400, { code: error });
    case GROUP_ROOM_ERROR.INVALID_TARGET:
    case GROUP_ROOM_ERROR.BAD_TARGET:
      return jsonError(error, 400, { code: error });
    default:
      return jsonError(error, 400, { code: error });
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
    code: "community_messenger_group_participants_invite_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ memberIds?: string[] }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("bad_request", 400, { code: "bad_request" });

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
    code: "community_messenger_group_participants_leave_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("bad_request", 400, { code: "bad_request" });

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
