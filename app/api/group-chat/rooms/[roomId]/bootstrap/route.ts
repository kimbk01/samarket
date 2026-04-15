/**
 * GET /api/group-chat/rooms/:roomId/bootstrap — 단일 부트스트랩 (문서: docs/group-chat-bootstrap.md)
 */
import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadGroupChatBootstrapForUser } from "@/lib/group-chat/load-group-chat-bootstrap-server";
import { jsonErrorWithRequest, jsonWithRequestIdHeader } from "@/lib/http/api-route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonErrorWithRequest(req, "roomId_required", 400);
  }

  const result = await loadGroupChatBootstrapForUser(auth.userId, roomId);
  if (!result.ok) {
    // result.body shape는 도메인 계약이므로 바디는 유지하고 requestId는 헤더로만 추가
    return jsonWithRequestIdHeader(req, { error: result.error }, { status: result.status });
  }
  return jsonWithRequestIdHeader(req, result.body);
}
