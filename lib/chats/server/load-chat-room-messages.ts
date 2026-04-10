import type { ChatMessage, ChatRoom } from "@/lib/types/chat";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseProductChatImageContent } from "@/lib/chats/chat-image-bundle";
import { integratedChatRowToMessage } from "@/lib/chats/fetch-chat-room-messages-api";
import { mapOrderChatMessageToChatMessage } from "@/lib/chats/fetch-order-chat-messages-api";
import { getOrderChatSnapshotForUser } from "@/lib/order-chat/service";
import type { OrderChatMessagePublic } from "@/lib/order-chat/types";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getChatServiceRoleSupabase } from "./service-role-supabase";

type LoaderError = { ok: false; status: number; error: string };
type LoaderOk<T> = { ok: true; value: T };

export type IntegratedMessageRow = Record<string, unknown>;

type LoadLegacyMessagesResult = LoaderOk<ChatMessage[]> | LoaderError;
type LoadIntegratedMessagesResult = LoaderOk<IntegratedMessageRow[]> | LoaderError;

function ok<T>(value: T): LoaderOk<T> {
  return { ok: true, value };
}

function fail(status: number, error: string): LoaderError {
  return { ok: false, status, error };
}

export async function loadLegacyProductChatMessagesForUser(
  roomId: string,
  userId: string
): Promise<LoadLegacyMessagesResult> {
  const sb = getChatServiceRoleSupabase();
  if (!sb) return fail(500, "서버 설정 필요");

  const { data: room } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    return fail(404, "채팅방을 찾을 수 없습니다.");
  }
  if (room.seller_id !== userId && room.buyer_id !== userId) {
    return fail(403, "참여자가 아님");
  }

  const { data: rows, error } = await sb
    .from("product_chat_messages")
    .select("id, product_chat_id, sender_id, content, message_type, image_url, read_at, created_at, is_hidden")
    .eq("product_chat_id", roomId)
    .order("created_at", { ascending: true });
  if (error) {
    return fail(500, error.message);
  }

  const messages = (rows ?? [])
    .filter((m: Record<string, unknown>) => !(m.is_hidden === true))
    .map((m: Record<string, unknown>) => {
      const mt = ((m.message_type as string) || "text") as "text" | "image" | "system";
      const rawContent = (m.content as string) ?? "";
      const rawUrl = (m.image_url as string | null | undefined) ?? null;
      let messageText = rawContent;
      let imageUrl: string | null = rawUrl;
      let imageUrls: string[] | undefined;
      if (mt === "image") {
        const parsed = parseProductChatImageContent(rawContent, rawUrl);
        messageText = parsed.caption;
        imageUrl = parsed.urls[0] ?? null;
        imageUrls = parsed.urls.length > 1 ? parsed.urls : undefined;
      }
      return {
        id: String(m.id ?? ""),
        roomId: String(m.product_chat_id ?? ""),
        senderId: String(m.sender_id ?? ""),
        message: messageText,
        messageType: mt,
        imageUrl,
        imageUrls,
        readAt: typeof m.read_at === "string" ? m.read_at : null,
        createdAt: (m.created_at as string) ?? "",
        isRead: typeof m.read_at === "string" && m.read_at.length > 0,
      } satisfies ChatMessage;
    });

  return ok(messages);
}

export async function loadIntegratedChatRoomMessageRowsForUser(input: {
  roomId: string;
  userId: string;
  before?: string | null;
  limit?: number;
}): Promise<LoadIntegratedMessagesResult> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return fail(500, "서버 설정 필요");
  }

  const roomId = input.roomId.trim();
  if (!roomId) return fail(400, "roomId 필요");

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const before = input.before?.trim();

  const [roomForGetRes, partRes] = await Promise.all([
    sb
      .from("chat_rooms")
      .select("id, room_type, buyer_id, seller_id, store_order_id")
      .eq("id", roomId)
      .maybeSingle(),
    sb
      .from("chat_room_participants")
      .select("id, hidden, left_at, is_active")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);
  const roomForGet = roomForGetRes.data;
  if (roomForGetRes.error || !(roomForGet as { id?: string } | null)?.id) {
    return fail(404, "채팅방을 찾을 수 없습니다.");
  }

  const roomType = (roomForGet as { room_type?: string }).room_type ?? "";
  if (roomType === "store_order") {
    return fail(404, "주문 채팅은 주문 전용 경로로 이동했습니다.");
  }
  if (roomType !== "item_trade") {
    return fail(404, "삭제된 채팅 유형입니다.");
  }

  const participant = partRes.data as { hidden?: boolean; left_at?: string | null; is_active?: boolean | null } | null;
  if (!participant || participant.hidden || participant.left_at || participant.is_active === false) {
    return fail(403, "참여자만 조회할 수 있습니다.");
  }

  let q = sb
    .from("chat_messages")
    .select(
      "id, room_id, sender_id, message_type, body, metadata, deleted_by_sender, is_hidden_by_admin, hidden_reason, created_at, read_at"
    )
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) {
    const { data: beforeRow } = await sb.from("chat_messages").select("created_at").eq("id", before).maybeSingle();
    if (beforeRow && typeof (beforeRow as { created_at: string }).created_at === "string") {
      q = q.lt("created_at", (beforeRow as { created_at: string }).created_at);
    }
  }

  const { data: messages, error } = await q;
  if (error) return fail(500, error.message);
  const rows = ((messages ?? []) as IntegratedMessageRow[])
    .reverse()
    .filter((message) => message.deleted_by_sender !== true);
  return ok(rows);
}

export async function loadChatMessagesForRoom(input: {
  room: ChatRoom;
  userId: string;
}): Promise<ChatMessage[]> {
  const { room, userId } = input;

  if (room.source === "product_chat") {
    const result = await loadLegacyProductChatMessagesForUser(room.id, userId);
    return result.ok ? result.value : [];
  }

  if (room.generalChat?.kind === "store_order") {
    const orderId = room.generalChat.storeOrderId?.trim() ?? "";
    if (!orderId) return [];
    const sb = tryGetSupabaseForStores();
    if (!sb) return [];
    const snapshot = await getOrderChatSnapshotForUser(sb as any, orderId, userId);
    if (!snapshot.ok) return [];
    return snapshot.snapshot.messages.map((row: OrderChatMessagePublic) =>
      mapOrderChatMessageToChatMessage(row, room.id, room.buyerId, userId)
    );
  }

  const result = await loadIntegratedChatRoomMessageRowsForUser({
    roomId: room.id,
    userId,
  });
  if (!result.ok) return [];
  return result.value
    .map((row) => integratedChatRowToMessage(row))
    .filter((message): message is ChatMessage => message != null);
}
