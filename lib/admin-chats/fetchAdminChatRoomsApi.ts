"use client";

import type { AdminChatRoom, RoomStatus } from "@/lib/types/admin-chat";

/**
 * 관리자 채팅 목록 — 서버 API (product_chats 기반)
 */
export async function fetchAdminChatRoomsApi(): Promise<AdminChatRoom[]> {
  const res = await fetch("/api/admin/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface FetchAdminChatRoomsListOptions {
  roomType?: "item_trade" | "general_chat" | "community" | "group" | "business";
  contextType?: string;
  hasReport?: boolean;
}

/**
 * 관리자 채팅 목록 — GET /api/admin/chat/rooms (chat_rooms 기반)
 * roomType/contextType/hasReport 로 거래채팅·신고채팅·업체채팅 분리 조회
 */
export async function fetchAdminChatRoomsListApi(
  options?: FetchAdminChatRoomsListOptions
): Promise<AdminChatRoom[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (options?.roomType) params.set("roomType", options.roomType);
  if (options?.contextType) params.set("contextType", options.contextType);
  if (options?.hasReport === true) params.set("hasReport", "true");
  const res = await fetch(`/api/admin/chat/rooms?${params.toString()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
  return rooms.map(
    (r: {
      id: string;
      room_type?: string;
      context_type?: string | null;
      item_id?: string | null;
      seller_id?: string | null;
      buyer_id?: string | null;
      last_message_preview?: string | null;
      last_message_at?: string | null;
      created_at: string;
      is_blocked?: boolean;
      is_locked?: boolean;
      productTitle?: string;
      reportCount?: number;
      sellerNickname?: string;
      buyerNickname?: string;
      initiator_id?: string | null;
      peer_id?: string | null;
    }) => {
      const roomStatus: RoomStatus = r.is_locked ? "archived" : r.is_blocked ? "blocked" : "active";
      const rt = r.room_type ?? "";
      const roomType =
        rt === "general_chat"
          ? "general_chat"
          : rt === "item_trade"
            ? "item_trade"
            : rt === "community"
              ? "community"
              : rt === "group"
                ? "group"
                : rt === "business"
                  ? "business"
                  : "";
      const trade = rt === "item_trade";
      const leftId = trade ? r.seller_id ?? "" : r.initiator_id ?? r.seller_id ?? "";
      const rightId = trade ? r.buyer_id ?? "" : r.peer_id ?? r.buyer_id ?? "";
      return {
        id: r.id,
        productId: r.item_id ?? "",
        productTitle: r.productTitle ?? "",
        productThumbnail: "",
        buyerId: rightId,
        buyerNickname: r.buyerNickname ?? rightId.slice(0, 8),
        sellerId: leftId,
        sellerNickname: r.sellerNickname ?? leftId.slice(0, 8),
        lastMessage: r.last_message_preview ?? "",
        lastMessageAt: r.last_message_at ?? r.created_at,
        messageCount: 0,
        reportCount: r.reportCount ?? 0,
        roomStatus,
        createdAt: r.created_at,
        roomType: roomType || undefined,
        contextType: r.context_type ?? undefined,
        adminChatStorage: "chat_rooms",
      } as AdminChatRoom;
    }
  );
}

/**
 * 모임 오픈채팅 방 목록 — GET /api/admin/chat/meeting-open-rooms
 */
export async function fetchAdminMeetingOpenChatRoomsListApi(options?: {
  hasReport?: boolean;
}): Promise<AdminChatRoom[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (options?.hasReport === true) params.set("hasReport", "true");
  const res = await fetch(`/api/admin/chat/meeting-open-rooms?${params.toString()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
  return rooms.map(
    (r: {
      id: string;
      meeting_id: string;
      meetingTitle?: string;
      title: string;
      thumbnail_url?: string | null;
      owner_user_id: string;
      ownerNickname?: string;
      last_message_preview?: string | null;
      last_message_at?: string | null;
      created_at: string;
      reportCount?: number;
      is_active?: boolean;
      active_member_count?: number;
    }) => {
      const roomStatus: RoomStatus = r.is_active === false ? "blocked" : "active";
      const meetingTitle = (r.meetingTitle ?? "").trim();
      const productTitle = meetingTitle ? `${r.title} · ${meetingTitle}` : r.title;
      return {
        id: r.id,
        productId: r.meeting_id,
        productTitle,
        productThumbnail: (r.thumbnail_url ?? "").trim(),
        buyerId: "",
        buyerNickname: `참여 ${r.active_member_count ?? 0}명`,
        sellerId: r.owner_user_id,
        sellerNickname: r.ownerNickname ?? r.owner_user_id.slice(0, 8),
        lastMessage: r.last_message_preview ?? "",
        lastMessageAt: r.last_message_at ?? r.created_at,
        messageCount: 0,
        reportCount: r.reportCount ?? 0,
        roomStatus,
        createdAt: r.created_at,
        roomType: "meeting_open_chat",
        adminChatStorage: "meeting_open_chat",
        meetingId: r.meeting_id,
      } as AdminChatRoom;
    }
  );
}
