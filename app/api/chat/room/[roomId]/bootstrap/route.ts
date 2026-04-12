import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  inferMessengerDomainFromChatRoom,
  MESSENGER_MONITORING_LABEL_DOMAIN,
} from "@/lib/chat-domain/messenger-domains";
import { loadTradeChatRoomBootstrap } from "@/lib/chat-domain/use-cases/trade-chat-bootstrap";
import { buildTradeChatBootstrapParticipants } from "@/lib/chats/trade-chat-bootstrap-extras";
import { createTradeChatReadAdapter } from "@/lib/chats/server/trade-chat-read-adapter";
import type { ChatRoomSource } from "@/lib/types/chat";
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

  const startedAt = Date.now();
  const port = createTradeChatReadAdapter();
  const result = await loadTradeChatRoomBootstrap(port, auth.userId, roomId, {
    sourceHint,
    detailScope: "full",
  });

  if (process.env.CHAT_PERF_LOG === "1") {
    const domain = result.ok
      ? inferMessengerDomainFromChatRoom(result.room)
      : MESSENGER_MONITORING_LABEL_DOMAIN.trade;
    console.info("[chat.room.bootstrap]", {
      roomId,
      domain,
      ok: result.ok,
      status: result.ok ? 200 : result.status,
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const room = result.room;
  const domain = inferMessengerDomainFromChatRoom(room);
  return NextResponse.json({
    v: 1,
    domain,
    room,
    messages: result.messages,
    unread: {
      count: room.unreadCount ?? 0,
    },
    participants: buildTradeChatBootstrapParticipants(room),
  });
}
