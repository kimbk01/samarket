import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  banGroupMember,
  listActiveGroupBans,
  unbanGroupMember,
} from "@/lib/community-messenger/group/group-room-ban-service";
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

function banJsonError(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.USER_BANNED:
      return jsonError("차단된 사용자는 그룹에 참여할 수 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError("권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
    case GROUP_ROOM_ERROR.NOT_GROUP_ROOM:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.BAD_TARGET:
    case GROUP_ROOM_ERROR.TARGET_NOT_FOUND:
      return jsonError("처리할 수 없는 대상입니다.", 400, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError("그룹 대화 기능을 사용하려면 DB 마이그레이션이 필요합니다.", 503, {
        code: error,
      });
    default:
      return jsonError("차단 요청을 처리하지 못했습니다.", 400, { code: error });
  }
}

/** List active bans (Blocked Members) */
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

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  if (!roomId) return jsonError("대화방 id가 필요합니다.", 400);

  const result = await listActiveGroupBans({ userId: auth.userId, roomId });
  if (!result.ok) return banJsonError(result.error);
  return jsonOk({ ok: true, bans: result.bans });
}

/** Ban member */
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
    key: `community-messenger:group-ban:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "차단 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_ban_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ targetUserId?: string; reason?: string | null }>(
    req,
    "invalid_json"
  );
  if (!parsed.ok) return parsed.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  const targetUserId = trimText(parsed.value.targetUserId);
  if (!roomId || !targetUserId) return jsonError("대상이 필요합니다.", 400);

  const result = await banGroupMember({
    userId: auth.userId,
    roomId,
    targetUserId,
    reason: parsed.value.reason ?? null,
  });
  if (!result.ok) return banJsonError(result.error);
  return jsonOk({ ok: true });
}

/** Unban member (?userId=) */
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
    key: `community-messenger:group-unban:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "차단 해제 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_unban_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const roomId = trimText(rawRoomId);
  const targetUserId = trimText(req.nextUrl.searchParams.get("userId"));
  if (!roomId || !targetUserId) return jsonError("대상이 필요합니다.", 400);

  const result = await unbanGroupMember({
    userId: auth.userId,
    roomId,
    targetUserId,
  });
  if (!result.ok) return banJsonError(result.error);
  return jsonOk({ ok: true });
}
