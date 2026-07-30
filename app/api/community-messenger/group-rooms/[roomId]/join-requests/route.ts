import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  decideGroupJoinRequest,
  listPendingGroupJoinRequests,
} from "@/lib/community-messenger/group/group-room-join-request-service";
import {
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
      return jsonError("가입 요청을 찾을 수 없습니다.", 404, { code: error });
    case GROUP_ROOM_ERROR.REQUEST_ALREADY_DECIDED:
      return jsonError("이미 처리된 가입 요청입니다.", 409, { code: error });
    case GROUP_ROOM_ERROR.USER_BANNED:
      return jsonError("차단된 사용자는 승인할 수 없습니다.", 403, { code: error });
    default:
      return jsonError("가입 요청을 처리하지 못했습니다.", 400, { code: error });
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
  const result = await listPendingGroupJoinRequests({ userId: auth.userId, roomId: roomId.trim() });
  if (!result.ok) return err(result.error);
  return jsonOk({ ok: true, requests: result.requests, pendingCount: result.pendingCount });
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
  await params;
  const parsed = await parseJsonBody<{ requestId?: string; decision?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const requestId = typeof parsed.value.requestId === "string" ? parsed.value.requestId.trim() : "";
  const decisionRaw = typeof parsed.value.decision === "string" ? parsed.value.decision.trim() : "";
  const decision = decisionRaw === "approved" || decisionRaw === "rejected" ? decisionRaw : null;
  if (!requestId || !decision) return jsonError("요청과 결정이 필요합니다.", 400);
  const result = await decideGroupJoinRequest({
    actorUserId: auth.userId,
    requestId,
    decision,
  });
  if (!result.ok) return err(result.error);
  return jsonOk({ ok: true, status: result.status, roomId: result.roomId });
}
