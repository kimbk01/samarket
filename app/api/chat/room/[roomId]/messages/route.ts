/**
 * 채팅방 메시지 목록 (서비스 롤)
 * GET /api/chat/room/[roomId]/messages (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadLegacyProductChatMessagesForUser } from "@/lib/chats/server/load-chat-room-messages";
import { parseRoomId } from "@/lib/validate-params";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId: raw } = await params;
  const roomId = parseRoomId(raw);
  if (!roomId) {
    return NextResponse.json({ error: "roomId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const result = await loadLegacyProductChatMessagesForUser(roomId, auth.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.value);
}
