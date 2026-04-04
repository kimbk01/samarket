/**
 * GET /api/admin/chat/rooms — 관리자 채팅방 목록 (관리자 세션)
 * Query: roomType, tradeStatus, requestStatus, blocked, hasReport, limit, cursor
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sbAny = sb;

  const roomType = req.nextUrl.searchParams.get("roomType")?.trim();
  const contextType = req.nextUrl.searchParams.get("contextType")?.trim();
  const tradeStatus = req.nextUrl.searchParams.get("tradeStatus")?.trim();
  const requestStatus = req.nextUrl.searchParams.get("requestStatus")?.trim();
  const blocked = req.nextUrl.searchParams.get("blocked");
  const hasReport = req.nextUrl.searchParams.get("hasReport") === "true";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
  const cursor = req.nextUrl.searchParams.get("cursor")?.trim();

  let q = sbAny
    .from("chat_rooms")
    .select(
      "id, room_type, item_id, context_type, seller_id, buyer_id, initiator_id, peer_id, request_status, trade_status, last_message_at, last_message_preview, is_blocked, is_locked, created_at, related_post_id, related_group_id, related_business_id"
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);
  if (roomType) q = q.eq("room_type", roomType);
  else q = q.eq("room_type", "item_trade");
  if (contextType) q = q.eq("context_type", contextType);
  if (tradeStatus) q = q.eq("trade_status", tradeStatus);
  if (requestStatus) q = q.eq("request_status", requestStatus);
  if (blocked === "true") q = q.eq("is_blocked", true);
  if (blocked === "false") q = q.eq("is_blocked", false);
  if (cursor) {
    const { data: cur } = await sbAny.from("chat_rooms").select("last_message_at").eq("id", cursor).maybeSingle();
    if (cur && (cur as { last_message_at: string }).last_message_at) {
      q = q.lt("last_message_at", (cur as { last_message_at: string }).last_message_at);
    }
  }
  const { data: rooms, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = (rooms ?? []).slice(0, limit) as {
    id: string;
    room_type?: string;
    item_id?: string | null;
    related_post_id?: string | null;
    related_group_id?: string | null;
    related_business_id?: string | null;
    initiator_id?: string | null;
    peer_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
    context_type?: string | null;
    [k: string]: unknown;
  }[];
  const roomIds = list.map((r) => r.id);
  const itemIds = [...new Set(list.map((r) => r.item_id).filter(Boolean))] as string[];
  const relatedPostIds = [...new Set(list.map((r) => r.related_post_id).filter(Boolean))] as string[];
  const postIdsForTitles = [...new Set([...itemIds, ...relatedPostIds])];

  let titleByPostId: Record<string, string> = {};
  if (postIdsForTitles.length > 0) {
    const { data: posts } = await sbAny.from("posts").select("id, title").in("id", postIdsForTitles);
    titleByPostId = (posts ?? []).reduce(
      (acc: Record<string, string>, p: { id: string; title?: string }) => {
        acc[p.id] = p.title ?? "";
        return acc;
      },
      {}
    );
  }

  const userIds = [
    ...new Set(
      list.flatMap((r) => {
        const trade = r.room_type === "item_trade";
        const a = trade ? r.seller_id : r.initiator_id;
        const b = trade ? r.buyer_id : r.peer_id;
        return [a, b].filter(Boolean) as string[];
      })
    ),
  ];
  const nickByUserId: Record<string, string> = {};
  if (userIds.length > 0) {
    const [{ data: profiles }, { data: testUsers }] = await Promise.all([
      sbAny.from("profiles").select("id, nickname, username").in("id", userIds),
      sbAny.from("test_users").select("id, display_name, username").in("id", userIds),
    ]);
    (profiles ?? []).forEach((p: { id: string; nickname?: string; username?: string }) => {
      nickByUserId[p.id] = (p.nickname ?? p.username ?? p.id.slice(0, 8)) as string;
    });
    (testUsers ?? []).forEach((t: { id: string; display_name?: string; username?: string }) => {
      if (!nickByUserId[t.id]) {
        nickByUserId[t.id] = (t.display_name ?? t.username ?? t.id.slice(0, 8)) as string;
      }
    });
  }

  const reportCountByRoomId: Record<string, number> = {};
  if (roomIds.length > 0) {
    for (const idChunk of chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
      const { data: reportRows } = await sbAny.from("chat_reports").select("room_id").in("room_id", idChunk);
      (reportRows ?? []).forEach((row: { room_id: string | null }) => {
        if (row.room_id) reportCountByRoomId[row.room_id] = (reportCountByRoomId[row.room_id] ?? 0) + 1;
      });
    }
  }

  let roomsWithMeta = list.map((r) => {
    const trade = r.room_type === "item_trade";
    const leftId = (trade ? r.seller_id : r.initiator_id) ?? "";
    const rightId = (trade ? r.buyer_id : r.peer_id) ?? "";
    let productTitle = "";
    if (r.item_id) productTitle = titleByPostId[r.item_id] ?? "";
    else if (r.related_post_id) productTitle = titleByPostId[r.related_post_id] ?? "";
    if (!productTitle && r.room_type === "item_trade") productTitle = "거래 채팅";
    return {
      ...r,
      productTitle,
      sellerNickname: leftId ? nickByUserId[leftId] ?? leftId.slice(0, 8) : "",
      buyerNickname: rightId ? nickByUserId[rightId] ?? rightId.slice(0, 8) : "",
      reportCount: reportCountByRoomId[r.id] ?? 0,
    };
  });
  if (hasReport) roomsWithMeta = roomsWithMeta.filter((r) => (r.reportCount ?? 0) > 0);
  const nextCursor = (rooms?.length ?? 0) > limit ? list[list.length - 1]?.id : null;
  return NextResponse.json({ rooms: roomsWithMeta, nextCursor });
}
