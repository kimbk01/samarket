"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { AdminChatRoom, RoomStatus } from "@/lib/types/admin-chat";

const DB_ROOM_STATUS_TO_UI: Record<string, RoomStatus> = {
  active: "active",
  blocked: "blocked",
  report_hold: "reported",
  closed: "archived",
};

/**
 * 관리자 채팅 목록 — Supabase product_chats 기반 (관리자 RLS로 전체 조회)
 */
export async function getAdminChatRoomsFromDb(): Promise<AdminChatRoom[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const sb = supabase as any;

  const { data: rooms, error } = await sb
    .from("product_chats")
    .select(`
      id,
      post_id,
      seller_id,
      buyer_id,
      last_message_at,
      last_message_preview,
      unread_count_seller,
      unread_count_buyer,
      created_at
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error || !rooms?.length) return [];

  const postIds = [...new Set(rooms.map((r: { post_id: string }) => r.post_id))];
  const { data: posts } = await sb.from("posts").select("id, title").in("id", postIds);
  const postMap = new Map((posts ?? []).map((p: { id: string; title: string }) => [p.id, p]));

  const { data: msgCounts } = await sb
    .from("product_chat_messages")
    .select("product_chat_id");
  const countByRoom = (msgCounts ?? []).reduce(
    (acc: Record<string, number>, m: { product_chat_id: string }) => {
      acc[m.product_chat_id] = (acc[m.product_chat_id] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const { data: reportRows } = await sb
    .from("reports")
    .select("room_id")
    .eq("target_type", "chat_room");
  const reportCountByRoom = (reportRows ?? []).reduce(
    (acc: Record<string, number>, r: { room_id: string | null }) => {
      if (r.room_id) {
        acc[r.room_id] = (acc[r.room_id] ?? 0) + 1;
      }
      return acc;
    },
    {}
  );

  const list = rooms.filter((r: {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count_seller?: number;
    unread_count_buyer?: number;
    created_at: string;
  }) => {
    const hasMessages = (countByRoom[r.id] ?? 0) > 0;
    const hasPreview = typeof r.last_message_preview === "string" && r.last_message_preview.trim() !== "";
    return hasMessages || hasPreview;
  });

  return list.map((r: {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    room_status?: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count_seller?: number;
    unread_count_buyer?: number;
    created_at: string;
  }) => {
    const post = postMap.get(r.post_id) as Record<string, unknown> | undefined;
    return {
      id: r.id,
      productId: r.post_id,
      productTitle: (typeof post?.title === "string" ? post.title : "") || "(제목 없음)",
      productThumbnail: "",
      buyerId: r.buyer_id,
      buyerNickname: r.buyer_id.slice(0, 8),
      sellerId: r.seller_id,
      sellerNickname: r.seller_id.slice(0, 8),
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      messageCount: countByRoom[r.id] ?? 0,
      reportCount: reportCountByRoom[r.id] ?? 0,
      roomStatus: DB_ROOM_STATUS_TO_UI[r.room_status ?? ""] ?? "active",
      createdAt: r.created_at,
      unreadSeller: r.unread_count_seller ?? 0,
      unreadBuyer: r.unread_count_buyer ?? 0,
      roomType: "item_trade",
      adminChatStorage: "product_chats",
    } as AdminChatRoom;
  });
}

/**
 * 관리자 채팅방 1건 조회
 */
export async function getAdminChatRoomByIdFromDb(roomId: string): Promise<AdminChatRoom | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const sb = supabase as any;
  const { data: room, error } = await sb
    .from("product_chats")
    .select(`
      id,
      post_id,
      seller_id,
      buyer_id,
      last_message_at,
      last_message_preview,
      created_at
    `)
    .eq("id", roomId)
    .single();

  if (error || !room) return null;

  const { data: post } = await sb.from("posts").select("id, title").eq("id", room.post_id).single();
  const { data: messages } = await sb
    .from("product_chat_messages")
    .select("id")
    .eq("product_chat_id", roomId);
  const { data: reports } = await sb
    .from("reports")
    .select("id")
    .eq("target_type", "chat_room")
    .eq("target_id", roomId);

  return {
    id: room.id,
    productId: room.post_id,
    productTitle: post?.title ?? "(제목 없음)",
    productThumbnail: "",
    buyerId: room.buyer_id,
    buyerNickname: room.buyer_id.slice(0, 8),
    sellerId: room.seller_id,
    sellerNickname: room.seller_id.slice(0, 8),
    lastMessage: room.last_message_preview ?? "",
    lastMessageAt: room.last_message_at ?? room.created_at,
    messageCount: messages?.length ?? 0,
    reportCount: reports?.length ?? 0,
    roomStatus: DB_ROOM_STATUS_TO_UI[(room as { room_status?: string }).room_status ?? ""] ?? "active",
    createdAt: room.created_at,
    roomType: "item_trade",
    adminChatStorage: "product_chats",
  } as AdminChatRoom;
}

/** 채팅방별 관련 신고 목록 (관리자 상세용) */
export interface RoomReportRow {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  reason_text: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export async function getReportsByRoomIdFromDb(roomId: string): Promise<RoomReportRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const sb = supabase as any;
  const { data } = await sb
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason_code, reason_text, status, created_at, resolved_at, resolved_by")
    .eq("target_type", "chat_room")
    .eq("target_id", roomId)
    .order("created_at", { ascending: false });
  return (data ?? []) as RoomReportRow[];
}
