import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { previewGroupInviteLink } from "@/lib/community-messenger/group/group-room-invite-link-service";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:group-invite-preview:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "초대 미리보기 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_group_invite_preview_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return jsonError("초대 토큰이 필요합니다.", 400);

  const result = await previewGroupInviteLink({ userId: auth.userId, inviteToken: token });
  if (!result.ok) {
    if (result.error === GROUP_ROOM_ERROR.ROOM_NOT_FOUND) {
      return jsonError("유효하지 않은 초대 링크입니다.", 404, { code: result.error });
    }
    return jsonError("초대 링크를 확인할 수 없습니다.", 400, { code: result.error });
  }
  return jsonOk({ ok: true, preview: result.preview });
}
