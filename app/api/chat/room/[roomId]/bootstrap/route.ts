import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import type { ChatRoomSource } from "@/lib/types/chat";
import { loadChatRoomBootstrapForUser } from "@/lib/chats/server/load-chat-room-bootstrap";
import { parseRoomId } from "@/lib/validate-params";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId: raw } = await params;
  const roomId = parseRoomId(raw);
  if (!roomId) {
    return NextResponse.json({ error: "roomId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const sourceHintRaw = req.nextUrl.searchParams.get("source")?.trim();
  const sourceHint: ChatRoomSource | null =
    sourceHintRaw === "chat_room" || sourceHintRaw === "product_chat" ? sourceHintRaw : null;

  const result = await loadChatRoomBootstrapForUser({
    roomId,
    userId: auth.userId,
    sourceHint,
    detailScope: "full",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ room: result.room, messages: result.messages });
}
