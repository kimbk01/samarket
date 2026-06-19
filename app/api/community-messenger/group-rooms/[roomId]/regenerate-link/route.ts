import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { regenerateGroupInviteLink } from "@/lib/community-messenger/group/group-room-invite-link-service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
} from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    key: `community-messenger:group-room-regenerate-link:${getRateLimitKey(req, auth.userId)}`,
    limit: 10,
    windowMs: 60_000,
    message: "초대 링크 재생성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_room_regenerate_link_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  const result = await regenerateGroupInviteLink({ userId: auth.userId, roomId: roomId.trim() });
  if (!result.ok) {
    if (result.error === GROUP_ROOM_ERROR.FORBIDDEN) {
      return jsonError("권한이 없습니다.", 403, { code: result.error });
    }
    return jsonError("초대 링크를 재생성하지 못했습니다.", 400, { code: result.error });
  }
  return jsonOk({ ok: true, inviteToken: result.inviteToken, inviteUrl: result.inviteUrl });
}
