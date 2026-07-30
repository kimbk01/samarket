import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  createGroupInviteLink,
  listGroupInviteLinks,
} from "@/lib/community-messenger/group/group-room-invite-link-service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function err(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError("권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
      return jsonError("그룹 대화방을 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED:
      return jsonError("그룹 초대 링크 마이그레이션이 필요합니다.", 503, { code: error });
    default:
      return jsonError("초대 링크를 처리하지 못했습니다.", 400, { code: error });
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
  const result = await listGroupInviteLinks({ userId: auth.userId, roomId: roomId.trim() });
  if (!result.ok) return err(result.error);
  return jsonOk({ ok: true, links: result.links });
}

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
    key: `community-messenger:group-invite-link-create:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "초대 링크 생성이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_invite_link_create_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  const parsed = await parseJsonBody<{
    name?: string;
    expiresAt?: string | null;
    usageLimit?: number | null;
    requiresApproval?: boolean;
    isDefault?: boolean;
  }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const result = await createGroupInviteLink({
    userId: auth.userId,
    roomId: roomId.trim(),
    name: parsed.value.name,
    expiresAt: parsed.value.expiresAt,
    usageLimit: parsed.value.usageLimit,
    requiresApproval: parsed.value.requiresApproval === true,
    isDefault: parsed.value.isDefault === true,
  });
  if (!result.ok) return err(result.error);
  return jsonOk({ ok: true, link: result.link });
}
