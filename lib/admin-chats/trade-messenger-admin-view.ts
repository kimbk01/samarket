/**
 * 채팅 Admin R1 (B · C-1) — 거래 Admin 상세의 사용자 방(CM) 오버레이.
 *
 * 레거시 응답(`/api/admin/chat/rooms/:id`)은 그대로 두고, CM 방이 있으면 메시지·참여자·상태를 CM 으로 덮는다.
 * CM 방이 없으면 `legacyOnly: true` — 화면은 「레거시 기록 (사용자 방 없음)」 읽기 전용으로 표시.
 * 서버 전용 (service role). 클라이언트는 타입만 import.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminCmMessageDisplay } from "@/lib/admin-community-messenger/admin-message-display";
import { listAdminCommunityMessengerRoomMessages } from "@/lib/admin-community-messenger/service";
import {
  resolveTradeMessengerRoomForAdmin,
  type TradeMessengerRoomSource,
} from "@/lib/admin-chats/trade-messenger-room";

export type AdminTradeMessengerParticipant = {
  userId: string;
  label: string;
  role: string;
  unreadCount: number;
  joinedAt: string | null;
  lastReadAt: string | null;
};

/** 레거시 상세 응답 메시지 모양(`body`)을 유지 + CM 표시 정보. */
export type AdminTradeMessengerMessage = {
  id: string;
  sender_id: string | null;
  sender_label: string;
  message_type: string;
  body: string;
  created_at: string;
  is_hidden_by_admin: boolean;
  report_count: number;
  display: AdminCmMessageDisplay;
};

export type AdminTradeMessengerInfo =
  | {
      legacyOnly: false;
      roomId: string;
      source: TradeMessengerRoomSource;
      roomStatus: "active" | "blocked" | "archived";
      isReadonly: boolean;
      chatDomain: string;
      participants: AdminTradeMessengerParticipant[];
      messagesHasMore: boolean;
      chatRoomId: string | null;
      productChatId: string | null;
      itemId: string | null;
    }
  | {
      legacyOnly: true;
      roomId: null;
      chatRoomId: string | null;
      productChatId: string | null;
      itemId: string | null;
    };

export type AdminTradeMessengerOverlay = {
  messenger: AdminTradeMessengerInfo;
  /** CM 방이 있을 때만 존재 — 레거시 메시지·상태를 대체 */
  messages?: AdminTradeMessengerMessage[];
  roomStatus?: "active" | "blocked" | "archived";
  messageCount?: number;
};

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoomStatus(value: unknown): "active" | "blocked" | "archived" {
  return value === "blocked" || value === "archived" ? value : "active";
}

export async function loadAdminTradeMessengerOverlay(
  sb: SupabaseClient<any>,
  legacyId: string
): Promise<AdminTradeMessengerOverlay> {
  const resolved = await resolveTradeMessengerRoomForAdmin(sb, legacyId);
  const legacyRefs = {
    chatRoomId: resolved.chatRoomId,
    productChatId: resolved.productChatId,
    itemId: resolved.itemId,
  };
  if (!resolved.messengerRoomId || !resolved.source) {
    return { messenger: { legacyOnly: true, roomId: null, ...legacyRefs } };
  }
  const roomId = resolved.messengerRoomId;
  const [{ data: roomRow }, { data: participantRows }, page] = await Promise.all([
    sb
      .from("community_messenger_rooms")
      .select("id, room_status, is_readonly, chat_domain")
      .eq("id", roomId)
      .maybeSingle(),
    sb
      .from("community_messenger_participants")
      .select("user_id, role, unread_count, joined_at, last_read_at")
      .eq("room_id", roomId),
    listAdminCommunityMessengerRoomMessages({ roomId }),
  ]);
  if (!roomRow) {
    return { messenger: { legacyOnly: true, roomId: null, ...legacyRefs } };
  }
  const room = roomRow as { room_status?: unknown; is_readonly?: unknown; chat_domain?: unknown };
  const parts = (participantRows ?? []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(parts.map((p) => s(p.user_id)).filter(Boolean))];
  const labelById = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname, username").in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; nickname?: string | null; username?: string | null }>) {
      labelById.set(p.id, s(p.nickname) || s(p.username));
    }
  }
  const roomStatus = normalizeRoomStatus(room.room_status);
  const messages: AdminTradeMessengerMessage[] = page.ok
    ? page.messages.map((m) => ({
        id: m.id,
        sender_id: m.senderId,
        sender_label: m.senderLabel,
        message_type: m.messageType,
        body: m.content,
        created_at: m.createdAt,
        is_hidden_by_admin: m.isHiddenByAdmin,
        report_count: m.reportCount,
        display: m.display,
      }))
    : [];
  return {
    messenger: {
      legacyOnly: false,
      roomId,
      source: resolved.source,
      roomStatus,
      isReadonly: room.is_readonly === true,
      chatDomain: s(room.chat_domain) || "trade",
      participants: parts.map((p) => {
        const uid = s(p.user_id);
        return {
          userId: uid,
          label: labelById.get(uid) || uid.slice(0, 8),
          role: s(p.role) || "member",
          unreadCount: Number(p.unread_count ?? 0) || 0,
          joinedAt: s(p.joined_at) || null,
          lastReadAt: s(p.last_read_at) || null,
        };
      }),
      messagesHasMore: page.ok ? page.hasMore : false,
      ...legacyRefs,
    },
    messages,
    roomStatus,
    messageCount: messages.length,
  };
}
