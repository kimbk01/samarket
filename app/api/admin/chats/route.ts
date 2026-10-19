import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAnyAdminPermission } from "@/lib/admin/chat-admin/chat-admin-guards";
import { TRADE_CHAT_ADMIN_PERMISSION_KEYS } from "@/lib/admin/chat-admin/chat-content-access-policy";
import type { AdminChatRoom, RoomStatus } from "@/lib/types/admin-chat";
import { ADMIN_LEGACY_PRODUCT_CHAT_LIST_LIMIT, CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { attachTradeMessengerRoomsToLegacyList } from "@/lib/admin-chats/trade-messenger-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_ROOM_STATUS: Record<string, RoomStatus> = {
  active: "active",
  blocked: "blocked",
  report_hold: "reported",
  closed: "archived",
};

const MESSAGE_COUNT_BATCH = 25;

/**
 * 관리자 채팅 목록 (서비스 롤) — 관리자 세션
 */
export async function POST(req: NextRequest) {
  const admin = await requireAnyAdminPermission(TRADE_CHAT_ADMIN_PERMISSION_KEYS);
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ error: supabaseEnv.error }, { status: 500 });
  }

  const anon = createClient(supabaseEnv.url, supabaseEnv.anonKey);

  const supabase = supabaseEnv.serviceKey
    ? createClient(supabaseEnv.url, supabaseEnv.serviceKey, { auth: { persistSession: false } })
    : anon;
  const sb = supabase as import("@supabase/supabase-js").SupabaseClient<any>;
  // 레거시 거래 기록(설계 §3-6): CM FK 없는 행만 — 최신 N건 상한에 오래된 레거시 방이 빠지지 않게.
  const body = (await req.json().catch(() => ({}))) as { legacyOnly?: boolean };

  let roomQuery = sb
    .from("product_chats")
    .select(`
      id,
      post_id,
      seller_id,
      buyer_id,
      last_message_at,
      last_message_preview,
      created_at,
      community_messenger_room_id
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(ADMIN_LEGACY_PRODUCT_CHAT_LIST_LIMIT);
  if (body.legacyOnly === true) roomQuery = roomQuery.is("community_messenger_room_id", null);
  const { data: rooms, error: roomErr } = await roomQuery;

  if (roomErr) {
    return NextResponse.json(
      { error: roomErr.message ?? "채팅 목록 조회 실패" },
      { status: 500 }
    );
  }

  if (!rooms?.length) {
    return NextResponse.json([]);
  }

  const postIds = [...new Set(rooms.map((r: { post_id: string }) => r.post_id))];
  const { data: posts } = await sb.from(POSTS_TABLE_READ).select("id, title").in("id", postIds);
  const postMap = new Map(
    (posts ?? []).map((p: { id: string; title: string }) => [p.id, p])
  );

  const roomIds = rooms.map((r: { id: string }) => r.id);
  const countByRoom: Record<string, number> = {};
  for (const batch of chunkIds(roomIds, MESSAGE_COUNT_BATCH)) {
    await Promise.all(
      batch.map(async (rid) => {
        const { count } = await sb
          .from("product_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("product_chat_id", rid);
        countByRoom[rid] = count ?? 0;
      })
    );
  }

  const reportCountByRoom: Record<string, number> = {};
  for (const idChunk of chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const { data: reportRows } = await sb
      .from("reports")
      .select("room_id")
      .eq("target_type", "chat_room")
      .in("room_id", idChunk);
    (reportRows ?? []).forEach((r: { room_id: string | null }) => {
      if (r.room_id) reportCountByRoom[r.room_id] = (reportCountByRoom[r.room_id] ?? 0) + 1;
    });
  }

  const list: AdminChatRoom[] = rooms.map(
    (r: {
      id: string;
      post_id: string;
      seller_id: string;
      buyer_id: string;
      room_status?: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      created_at: string;
    }) => {
      const post = postMap.get(r.post_id);
      return {
        id: r.id,
        productId: r.post_id,
        productTitle: post?.title ?? "(제목 없음)",
        productThumbnail: "",
        buyerId: r.buyer_id,
        buyerNickname: r.buyer_id.slice(0, 8),
        sellerId: r.seller_id,
        sellerNickname: r.seller_id.slice(0, 8),
        lastMessage: r.last_message_preview ?? "",
        lastMessageAt: r.last_message_at ?? r.created_at,
        messageCount: countByRoom[r.id] ?? 0,
        reportCount: reportCountByRoom[r.id] ?? 0,
        roomStatus: DB_ROOM_STATUS[r.room_status ?? ""] ?? "active",
        createdAt: r.created_at,
        roomType: "item_trade",
        adminChatStorage: "product_chats",
      };
    }
  );

  // R1-B C-1: 사용자 방(CM) id·상태 — 조회 전용, 실패해도 목록은 반환
  const messengerByRoom = await attachTradeMessengerRoomsToLegacyList(
    sb,
    (rooms as Array<{ id: string; post_id: string; seller_id: string; buyer_id: string; community_messenger_room_id?: string | null }>).map(
      (r) => ({
        key: r.id,
        chatRoomId: null,
        productChatId: r.id,
        chatRoomFk: null,
        productChatFk: r.community_messenger_room_id ?? null,
        itemId: r.post_id,
        sellerId: r.seller_id,
        buyerId: r.buyer_id,
      })
    )
  ).catch(() => new Map());
  return NextResponse.json(
    list.map((row) => {
      const m = messengerByRoom.get(row.id);
      return m
        ? { ...row, messengerRoomId: m.roomId, roomStatus: m.roomStatus, isReadonly: m.isReadonly }
        : { ...row, messengerRoomId: null };
    })
  );
}
