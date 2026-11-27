import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { getGroupInviteLink } from "@/lib/community-messenger/group/group-room-invite-link-service";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function groupRoomServiceJsonError(error: string) {
  switch (error) {
    case GROUP_ROOM_ERROR.FORBIDDEN:
      return jsonError(error, 403, { code: error });
    case GROUP_ROOM_ERROR.ROOM_NOT_FOUND:
      return jsonError(error, 404, { code: error });
    default:
      return jsonError(error, 400, { code: error });
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
  const result = await getGroupInviteLink({ userId: auth.userId, roomId: roomId.trim() });
  if (!result.ok) return groupRoomServiceJsonError(result.error);
  return jsonOk({
    ok: true,
    inviteToken: result.inviteToken,
    inviteUrl: result.inviteUrl,
    enabled: result.enabled,
  });
}
