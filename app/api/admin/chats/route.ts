import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import type { AdminChatRoom, RoomStatus } from "@/lib/types/admin-chat";
import { ADMIN_LEGACY_PRODUCT_CHAT_LIST_LIMIT, CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";

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
export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const anon = createClient(url, anonKey);

  const supabase = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : anon;
  const sb = supabase as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: rooms, error: roomErr } = await sb
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
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(ADMIN_LEGACY_PRODUCT_CHAT_LIST_LIMIT);

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
  const { data: posts } = await sb.from("posts").select("id, title").in("id", postIds);
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

  return NextResponse.json(list);
}
