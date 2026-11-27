import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import type { GroupRoomSettingsPatch } from "@/lib/community-messenger/group/group-room.types";
import { updateGroupRoomSettings } from "@/lib/community-messenger/group/group-room-service";
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
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError(error, 404, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError(error, 503, {
        code: error,
      });
    default:
      return jsonError(error, 400, { code: error });
  }
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
    key: `community-messenger:group-room-settings:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    code: "community_messenger_group_room_settings_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{
    title?: string;
    noticeText?: string;
    allowMemberInvite?: boolean;
    allowAdminInvite?: boolean;
    allowAdminKick?: boolean;
    allowAdminEditNotice?: boolean;
    allowMemberUpload?: boolean;
    allowMemberCall?: boolean;
  }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("bad_request", 400, { code: "bad_request" });

  const body = parsed.value;
  const settings: GroupRoomSettingsPatch = {
    title: typeof body.title === "string" ? body.title : undefined,
    noticeText: typeof body.noticeText === "string" ? body.noticeText : undefined,
    allowMemberInvite:
      typeof body.allowMemberInvite === "boolean" ? body.allowMemberInvite : undefined,
    allowAdminInvite: typeof body.allowAdminInvite === "boolean" ? body.allowAdminInvite : undefined,
    allowAdminKick: typeof body.allowAdminKick === "boolean" ? body.allowAdminKick : undefined,
    allowAdminEditNotice:
      typeof body.allowAdminEditNotice === "boolean" ? body.allowAdminEditNotice : undefined,
    allowMemberUpload:
      typeof body.allowMemberUpload === "boolean" ? body.allowMemberUpload : undefined,
    allowMemberCall: typeof body.allowMemberCall === "boolean" ? body.allowMemberCall : undefined,
  };

  const result = await updateGroupRoomSettings({
    userId: auth.userId,
    roomId,
    settings,
  });
  if (!result.ok) return groupRoomServiceJsonError(result.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED);
  return jsonOk({});
}
