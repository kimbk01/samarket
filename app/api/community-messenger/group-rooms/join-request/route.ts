import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  cancelGroupJoinRequest,
  requestGroupJoinByInviteToken,
} from "@/lib/community-messenger/group/group-room-join-request-service";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-join-request:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "가입 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_join_request_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ inviteToken?: string; action?: string; roomId?: string }>(
    req,
    "invalid_json"
  );
  if (!parsed.ok) return parsed.response;
  const action = typeof parsed.value.action === "string" ? parsed.value.action.trim() : "request";

  if (action === "cancel") {
    const roomId = typeof parsed.value.roomId === "string" ? parsed.value.roomId.trim() : "";
    if (!roomId) return jsonError("그룹이 필요합니다.", 400);
    const result = await cancelGroupJoinRequest({ userId: auth.userId, roomId });
    if (!result.ok) return jsonError("가입 요청을 취소하지 못했습니다.", 400, { code: result.error });
    return jsonOk({ ok: true });
  }

  const inviteToken = typeof parsed.value.inviteToken === "string" ? parsed.value.inviteToken.trim() : "";
  if (!inviteToken) return jsonError("초대 토큰이 필요합니다.", 400);
  const result = await requestGroupJoinByInviteToken({ userId: auth.userId, inviteToken });
  if (!result.ok) {
    if (result.error === GROUP_ROOM_ERROR.ROOM_NOT_FOUND) {
      return jsonError("유효하지 않은 초대 링크입니다.", 404, { code: result.error });
    }
    return jsonError("가입 요청에 실패했습니다.", 400, { code: result.error });
  }
  if (result.alreadyMember) {
    return jsonOk({
      ok: true,
      alreadyMember: true,
      roomId: result.roomId,
      roomPath: buildGroupRoomWebPath(result.roomId),
    });
  }
  return jsonOk({
    ok: true,
    requestId: result.requestId,
    roomId: result.roomId,
    status: result.status,
    existing: result.existing === true,
  });
}
