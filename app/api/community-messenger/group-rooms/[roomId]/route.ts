import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { deletePrivateGroupRoomSoft } from "@/lib/community-messenger/group/group-room-delete-service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function deleteJsonError(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.FORBIDDEN:
    case GROUP_ROOM_ERROR.NOT_OWNER:
      return jsonError("그룹을 삭제할 권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.ROOM_DELETED:
      return jsonError("이미 삭제된 그룹입니다.", 410, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError("그룹 대화 기능을 사용하려면 DB 마이그레이션이 필요합니다.", 503, {
        code: error,
      });
    default:
      return jsonError("그룹을 삭제하지 못했습니다.", 400, { code: error });
  }
}

/**
 * DELETE /api/community-messenger/group-rooms/[roomId]
 * Soft-delete private_group (Owner only). Body optional: { action: "delete" }
 * Does not hard-delete room rows.
 */
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
    key: `community-messenger:group-delete:${getRateLimitKey(req, auth.userId)}`,
    limit: 10,
    windowMs: 60_000,
    message: "삭제 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_delete_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("대화방 id가 필요합니다.", 400);

  const result = await deletePrivateGroupRoomSoft({
    userId: auth.userId,
    roomId,
  });
  if (!result.ok) return deleteJsonError(result.error);
  return jsonOk({
    ok: true,
    alreadyDeleted: result.alreadyDeleted === true,
    deletedAt: result.deletedAt ?? null,
  });
}
