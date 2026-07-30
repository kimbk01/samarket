import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  revokeGroupInviteLink,
  updateGroupInviteLink,
} from "@/lib/community-messenger/group/group-room-invite-link-service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function err(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError("권한이 없습니다.", 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
      return jsonError("초대 링크를 찾을 수 없습니다.", 404, { code: error });
    default:
      return jsonError("초대 링크를 처리하지 못했습니다.", 400, { code: error });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; linkId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;
  const { linkId } = await params;
  const parsed = await parseJsonBody<{
    name?: string | null;
    expiresAt?: string | null;
    clearExpires?: boolean;
    usageLimit?: number | null;
    clearUsageLimit?: boolean;
    requiresApproval?: boolean;
  }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const result = await updateGroupInviteLink({
    userId: auth.userId,
    linkId: linkId.trim(),
    name: parsed.value.name,
    expiresAt: parsed.value.expiresAt,
    clearExpires: parsed.value.clearExpires === true,
    usageLimit: parsed.value.usageLimit,
    clearUsageLimit: parsed.value.clearUsageLimit === true,
    requiresApproval: parsed.value.requiresApproval,
  });
  if (!result.ok) return err(result.error);
  return jsonOk({ ok: true, link: result.link });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string; linkId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;
  const { linkId } = await params;
  const result = await revokeGroupInviteLink({ userId: auth.userId, linkId: linkId.trim() });
  if (!result.ok) return err(result.error);
  return jsonOk({ ok: true });
}
