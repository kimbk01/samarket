import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { integratedChatRowToMessage } from "@/lib/chats/fetch-chat-room-messages-api";
import { loadChatRoomDetailForUser } from "@/lib/chats/server/load-chat-room-detail";
import {
  loadChatMessagesForRoom,
  loadIntegratedChatRoomMessageRowsForUser,
  loadLegacyProductChatMessagesForUser,
} from "@/lib/chats/server/load-chat-room-messages";

export const dynamic = "force-dynamic";

async function fetchHintedMessages(
  userId: string,
  roomId: string,
  sourceHint: ChatRoomSource
): Promise<ChatMessage[]> {
  if (sourceHint === "product_chat") {
    const result = await loadLegacyProductChatMessagesForUser(roomId, userId);
    return result.ok ? result.value : [];
  }
  const result = await loadIntegratedChatRoomMessageRowsForUser({ roomId, userId });
  if (!result.ok) return [];
  const rows = result.value;
  return rows
    .map((row) => integratedChatRowToMessage(row))
    .filter((message): message is ChatMessage => message != null);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId } = await params;
  if (!roomId?.trim()) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const sourceHintRaw = req.nextUrl.searchParams.get("source")?.trim();
  const sourceHint =
    sourceHintRaw === "chat_room" || sourceHintRaw === "product_chat"
      ? (sourceHintRaw as ChatRoomSource)
      : null;
  const detailPromise = loadChatRoomDetailForUser({ roomId: roomId.trim(), userId: auth.userId });
  const hintedMessagesPromise = sourceHint
    ? fetchHintedMessages(auth.userId, roomId.trim(), sourceHint).catch(() => [])
    : null;
  const detailResult = await detailPromise;
  if (!detailResult.ok) {
    return NextResponse.json({ error: detailResult.error }, { status: detailResult.status });
  }

  const room = detailResult.room;
  const messages =
    hintedMessagesPromise && room.source === sourceHint
      ? await hintedMessagesPromise
      : await loadChatMessagesForRoom({ room, userId: auth.userId }).catch(() => []);
  return NextResponse.json({ room, messages });
}
