import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  getGroupRoomProfile,
  updateGroupRoomProfile,
} from "@/lib/community-messenger/group/group-room-profile-service";
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
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    default:
      return jsonError("그룹 프로필을 변경하지 못했습니다.", 400, { code: error });
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
  const result = await getGroupRoomProfile({ userId: auth.userId, roomId: roomId.trim() });
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({ ok: true, profile: result.profile });
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
    key: `community-messenger:group-room-profile:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "그룹 프로필 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_room_profile_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ title?: string; avatarUrl?: string | null }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const { roomId } = await params;
  const result = await updateGroupRoomProfile({
    userId: auth.userId,
    roomId: roomId.trim(),
    patch: {
      title: typeof parsed.value.title === "string" ? parsed.value.title : undefined,
      avatarUrl: parsed.value.avatarUrl,
    },
  });
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({ ok: true });
}
