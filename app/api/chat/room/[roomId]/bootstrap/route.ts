import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { integratedChatRowToMessage } from "@/lib/chats/fetch-chat-room-messages-api";
import { mapOrderChatMessageToChatMessage } from "@/lib/chats/fetch-order-chat-messages-api";
import type { OrderChatMessagePublic } from "@/lib/order-chat/types";

export const dynamic = "force-dynamic";

function buildForwardHeaders(req: NextRequest): HeadersInit {
  const cookie = req.headers.get("cookie");
  return cookie ? { cookie } : {};
}

async function fetchRoomDetail(origin: string, roomId: string, headers: HeadersInit): Promise<Response> {
  return fetch(`${origin}/api/chat/room/${encodeURIComponent(roomId)}`, {
    headers,
    cache: "no-store",
  });
}

async function fetchTradeMessages(
  origin: string,
  room: ChatRoom,
  headers: HeadersInit,
  currentUserId: string
): Promise<ChatMessage[]> {
  if (room.source === "product_chat") {
    const res = await fetch(`${origin}/api/chat/room/${encodeURIComponent(room.id)}/messages`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => [])) as unknown;
    return Array.isArray(json) ? (json as ChatMessage[]) : [];
  }

  if (room.generalChat?.kind === "store_order") {
    const orderId = room.generalChat.storeOrderId?.trim() ?? "";
    if (!orderId) return [];
    const res = await fetch(`${origin}/api/order-chat/orders/${encodeURIComponent(orderId)}`, {
      headers,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      messages?: OrderChatMessagePublic[];
    };
    if (!res.ok || json.ok !== true || !Array.isArray(json.messages)) return [];
    return json.messages.map((row) =>
      mapOrderChatMessageToChatMessage(row, room.id, room.buyerId, currentUserId)
    );
  }

  const res = await fetch(`${origin}/api/chat/rooms/${encodeURIComponent(room.id)}/messages`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { messages?: Record<string, unknown>[] };
  const rows = Array.isArray(json.messages) ? json.messages : [];
  return rows
    .map((row) => integratedChatRowToMessage(row))
    .filter((message): message is ChatMessage => message != null);
}

async function fetchHintedMessages(
  origin: string,
  roomId: string,
  sourceHint: ChatRoomSource,
  headers: HeadersInit
): Promise<ChatMessage[]> {
  if (sourceHint === "product_chat") {
    const res = await fetch(`${origin}/api/chat/room/${encodeURIComponent(roomId)}/messages`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => [])) as unknown;
    return Array.isArray(json) ? (json as ChatMessage[]) : [];
  }
  const res = await fetch(`${origin}/api/chat/rooms/${encodeURIComponent(roomId)}/messages`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { messages?: Record<string, unknown>[] };
  const rows = Array.isArray(json.messages) ? json.messages : [];
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

  const origin = req.nextUrl.origin;
  const headers = buildForwardHeaders(req);
  const sourceHintRaw = req.nextUrl.searchParams.get("source")?.trim();
  const sourceHint =
    sourceHintRaw === "chat_room" || sourceHintRaw === "product_chat"
      ? (sourceHintRaw as ChatRoomSource)
      : null;
  const detailPromise = fetchRoomDetail(origin, roomId.trim(), headers);
  const hintedMessagesPromise = sourceHint
    ? fetchHintedMessages(origin, roomId.trim(), sourceHint, headers).catch(() => [])
    : null;
  const detailRes = await detailPromise;
  const detailJson = (await detailRes.json().catch(() => null)) as ChatRoom | { error?: string } | null;
  if (!detailRes.ok || !detailJson || typeof detailJson !== "object" || !("id" in detailJson)) {
    return NextResponse.json(detailJson ?? { error: "채팅방을 불러오지 못했습니다." }, { status: detailRes.status });
  }

  const room = detailJson as ChatRoom;
  const messages =
    hintedMessagesPromise && room.source === sourceHint
      ? await hintedMessagesPromise
      : await fetchTradeMessages(origin, room, headers, auth.userId).catch(() => []);
  return NextResponse.json({ room, messages });
}
