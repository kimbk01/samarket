import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { createGroupRoom, listMyGroupRooms } from "@/lib/community-messenger/group/group-room-service";
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
    case GROUP_ROOM_ERROR.BLOCKED_TARGET:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.FRIEND_REQUIRED:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError(error, 404, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError(error, 503, {
        code: error,
      });
    case GROUP_ROOM_ERROR.MEMBERS_REQUIRED:
      return jsonError(error, 400, { code: error });
    case GROUP_ROOM_ERROR.INVALID_TARGET:
      return jsonError(error, 400, { code: error });
    default:
      return jsonError(error, 400, { code: error });
  }
}

/** 내 private_group 목록 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-rooms-list:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    code: "community_messenger_group_rooms_list_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const rawLimit = req.nextUrl.searchParams.get("limit");
  const limit = rawLimit != null && rawLimit !== "" ? Math.floor(Number(rawLimit)) : undefined;

  const result = await listMyGroupRooms(
    auth.userId,
    Number.isFinite(limit ?? NaN) ? limit : undefined
  );
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({ rooms: result.rooms });
}

/** private_group 생성 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-rooms-create:${getRateLimitKey(req, auth.userId)}`,
    limit: 6,
    windowMs: 60_000,
    code: "community_messenger_group_rooms_create_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ title?: string; memberIds?: string[] }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const result = await createGroupRoom({
    userId: auth.userId,
    title: String(body.title ?? ""),
    memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
  });
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({ roomId: result.roomId });
}
