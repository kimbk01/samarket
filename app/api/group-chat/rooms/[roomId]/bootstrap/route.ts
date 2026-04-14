/**
 * GET /api/group-chat/rooms/:roomId/bootstrap — 단일 부트스트랩 (문서: docs/group-chat-bootstrap.md)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadGroupChatBootstrapForUser } from "@/lib/group-chat/load-group-chat-bootstrap-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const result = await loadGroupChatBootstrapForUser(auth.userId, roomId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}
