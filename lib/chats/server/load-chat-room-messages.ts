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

/** PostgREST `.or()` 안전한 큰따옴표 문자열 (타임스탬프·UUID) */
function escapePostgrestDoubleQuoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isLikelyIso8601(s: string): boolean {
  if (!s || s.length < 10) return false;
  return Number.isFinite(Date.parse(s));
}

/** ORDER BY created_at DESC, id DESC 에서 커서보다 더 과거 행만 (키셋). */
function keysetBeforeRoomMessagesOrFilter(cursorCreatedAt: string, cursorId: string): string {
  const qTs = escapePostgrestDoubleQuoted(cursorCreatedAt);
  const qId = escapePostgrestDoubleQuoted(cursorId);
  return `created_at.lt.${qTs},and(created_at.eq.${qTs},id.lt.${qId})`;
}

/** 부트스트랩·RSC — 통합 채팅 기본 50과 별도로 레거시 방은 최근 윈도우만 */
export const LEGACY_PRODUCT_CHAT_BOOTSTRAP_MESSAGE_LIMIT = 30;
/** GET /api/chat/room/.../messages 기본 페이지 크기 (통합 `INTEGRATED_CHAT_MESSAGES_DEFAULT_LIMIT` 과 맞춤) */
export const LEGACY_PRODUCT_CHAT_MESSAGES_PAGE_MAX = 100;

export type LegacyProductChatMessagesPage = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: { before: string; beforeCreatedAt: string } | null;
};

type LoadLegacyPageResult = LoaderOk<LegacyProductChatMessagesPage> | LoaderError;

function mapProductChatRowsToMessages(rows: Record<string, unknown>[]): ChatMessage[] {
  return rows
    .filter((m) => !(m.is_hidden === true))
    .map((m) => {
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
}

/**
 * 레거시 product_chat_messages — 최근 페이지만 (키셋 과거 페이지).
 * 반환 `messages` 는 시간순(오래된 것 먼저) — 통합 채팅 GET 과 동일.
 */
export async function loadLegacyProductChatMessagesPageForUser(
  roomId: string,
  userId: string,
  options?: {
    limit?: number;
    before?: string | null;
    beforeCreatedAt?: string | null;
  }
): Promise<LoadLegacyPageResult> {
  const sb = getChatServiceRoleSupabase();
  if (!sb) return fail(500, "서버 설정 필요");

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), LEGACY_PRODUCT_CHAT_MESSAGES_PAGE_MAX);
  const before = options?.before?.trim();
  const beforeCreatedAtHint = options?.beforeCreatedAt?.trim() ?? "";

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

  let q = sb
    .from("product_chat_messages")
    .select("id, product_chat_id, sender_id, content, message_type, image_url, read_at, created_at, is_hidden")
    .eq("product_chat_id", roomId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (before) {
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (beforeCreatedAtHint && isLikelyIso8601(beforeCreatedAtHint)) {
      cursorCreatedAt = beforeCreatedAtHint;
      cursorId = before;
    } else {
      const { data: beforeRow } = await sb
        .from("product_chat_messages")
        .select("id, created_at")
        .eq("product_chat_id", roomId)
        .eq("id", before)
        .maybeSingle();
      const br = beforeRow as { id?: string; created_at?: string } | null;
      if (!br || typeof br.created_at !== "string") {
        return fail(404, "기준 메시지를 찾을 수 없습니다.");
      }
      cursorCreatedAt = br.created_at;
      cursorId = typeof br.id === "string" ? br.id : before;
    }

    if (cursorCreatedAt && cursorId) {
      q = q.or(keysetBeforeRoomMessagesOrFilter(cursorCreatedAt, cursorId));
    }
  }

  const { data: rows, error } = await q;
  if (error) {
    return fail(500, error.message);
  }

  const raw = (rows ?? []) as Record<string, unknown>[];
  const chronological = mapProductChatRowsToMessages(raw).reverse();
  const hasMore = raw.length === limit && raw.length > 0;
  const oldest = chronological[0] as ChatMessage | undefined;
  const nextCursor =
    hasMore && oldest?.id && oldest.createdAt
      ? { before: oldest.id, beforeCreatedAt: oldest.createdAt }
      : null;

  return ok({ messages: chronological, hasMore, nextCursor });
}

/** 최근 N건만 — 전체 히스토리 로드 금지 (부트스트랩·폴백용) */
export async function loadLegacyProductChatMessagesForUser(
  roomId: string,
  userId: string,
  options?: { limit?: number }
): Promise<LoadLegacyMessagesResult> {
  const page = await loadLegacyProductChatMessagesPageForUser(roomId, userId, {
    limit: options?.limit ?? LEGACY_PRODUCT_CHAT_BOOTSTRAP_MESSAGE_LIMIT,
  });
  if (!page.ok) return page;
  return ok(page.value.messages);
}

export async function loadIntegratedChatRoomMessageRowsForUser(input: {
  roomId: string;
  userId: string;
  before?: string | null;
  /** 키셋 1-hop: `before` 메시지 id와 짝 — 있으면 기준 행 조회 생략 */
  beforeCreatedAt?: string | null;
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
  const beforeCreatedAtHint = input.beforeCreatedAt?.trim() ?? "";

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
    .order("id", { ascending: false })
    .limit(limit);

  if (before) {
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (beforeCreatedAtHint && isLikelyIso8601(beforeCreatedAtHint)) {
      cursorCreatedAt = beforeCreatedAtHint;
      cursorId = before;
    } else {
      const { data: beforeRow } = await sb
        .from("chat_messages")
        .select("id, created_at")
        .eq("room_id", roomId)
        .eq("id", before)
        .maybeSingle();
      const br = beforeRow as { id?: string; created_at?: string } | null;
      if (!br || typeof br.created_at !== "string") {
        return fail(404, "기준 메시지를 찾을 수 없습니다.");
      }
      cursorCreatedAt = br.created_at;
      cursorId = typeof br.id === "string" ? br.id : before;
    }

    if (cursorCreatedAt && cursorId) {
      q = q.or(keysetBeforeRoomMessagesOrFilter(cursorCreatedAt, cursorId));
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
  /** 부트스트랩 등 — 지정 시 통합·레거시·주문 연동 메시지 창을 이 개수로 제한 */
  messageLimit?: number;
}): Promise<ChatMessage[]> {
  const { room, userId, messageLimit } = input;

  if (room.source === "product_chat") {
    const result = await loadLegacyProductChatMessagesForUser(
      room.id,
      userId,
      typeof messageLimit === "number" ? { limit: messageLimit } : undefined
    );
    return result.ok ? result.value : [];
  }

  if (room.generalChat?.kind === "store_order") {
    const orderId = room.generalChat.storeOrderId?.trim() ?? "";
    if (!orderId) return [];
    const sb = tryGetSupabaseForStores();
    if (!sb) return [];
    const snapshot = await getOrderChatSnapshotForUser(sb as any, orderId, userId, {
      ...(typeof messageLimit === "number" ? { messageLimit } : {}),
    });
    if (!snapshot.ok) return [];
    return snapshot.snapshot.messages.map((row: OrderChatMessagePublic) =>
      mapOrderChatMessageToChatMessage(row, room.id, room.buyerId, userId)
    );
  }

  const result = await loadIntegratedChatRoomMessageRowsForUser({
    roomId: room.id,
    userId,
    ...(typeof messageLimit === "number" ? { limit: messageLimit } : {}),
  });
  if (!result.ok) return [];
  return result.value
    .map((row) => integratedChatRowToMessage(row))
    .filter((message): message is ChatMessage => message != null);
}
