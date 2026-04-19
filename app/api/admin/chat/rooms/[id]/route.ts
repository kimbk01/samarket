import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chat/rooms/:id — 관리자 채팅방 상세 (관리자 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { resolveChatRoomId } from "@/lib/admin-chats/resolve-chat-room-id";
import { fetchModerationLogsForRoom } from "@/lib/admin-chats/fetch-moderation-logs-for-room";
import { PRODUCT_CHAT_ADMIN_LIST_SELECT, REPORT_ROW_ADMIN_MIN_SELECT } from "@/lib/admin/product-chat-sql-select";
import {

  CHAT_EVENT_LOGS_ADMIN_SELECT,
  CHAT_REPORTS_ADMIN_SELECT,
  CHAT_ROOM_ADMIN_DETAIL_SELECT,
  CHAT_ROOM_PARTICIPANT_API_SELECT,
} from "@/lib/chat/chat-sql-selects";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const { id: roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;

  const room = await sbAny
    .from("chat_rooms")
    .select(CHAT_ROOM_ADMIN_DETAIL_SELECT)
    .eq("id", roomId)
    .maybeSingle()
    .then((r) => r.data);

  if (room) {
    const roomRow = room as {
      room_type?: string;
      item_id: string | null;
      seller_id: string | null;
      buyer_id: string | null;
      initiator_id?: string | null;
      peer_id?: string | null;
      related_post_id?: string | null;
      related_group_id?: string | null;
      related_business_id?: string | null;
      context_type?: string | null;
      last_message_preview: string | null;
      last_message_at: string | null;
      created_at: string;
      is_blocked?: boolean;
      is_locked?: boolean;
    };
    if (roomRow.room_type !== "item_trade") {
      return NextResponse.json({ error: "삭제된 채팅 유형입니다." }, { status: 404 });
    }
    const [participants, messages, events, reports] = await Promise.all([
      sbAny.from("chat_room_participants").select(CHAT_ROOM_PARTICIPANT_API_SELECT).eq("room_id", roomId),
      sbAny.from("chat_messages").select("id, sender_id, message_type, body, created_at, is_hidden_by_admin").eq("room_id", roomId).order("created_at", { ascending: true }).limit(200),
      sbAny
        .from("chat_event_logs")
        .select(CHAT_EVENT_LOGS_ADMIN_SELECT)
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(100),
      sbAny.from("chat_reports").select(CHAT_REPORTS_ADMIN_SELECT).eq("room_id", roomId),
    ]);
    let item: Record<string, unknown> | null = null;
    let productTitle = "";
    let productThumbnail = "";
    const trade = roomRow.room_type === "item_trade";
    const postIdForCard = roomRow.item_id ?? roomRow.related_post_id ?? null;
    if (postIdForCard) {
      const { data: post } = await sbAny
        .from(POSTS_TABLE_READ)
        .select("id, title, price, status, thumbnail_url, images")
        .eq("id", postIdForCard)
        .maybeSingle();
      if (post) {
        const p = post as Record<string, unknown>;
        item = p;
        productTitle = (typeof p.title === "string" ? p.title : "") || "";
        const thumb = p.thumbnail_url;
        const imgs = p.images;
        if (typeof thumb === "string" && thumb.trim()) productThumbnail = thumb.trim();
        else if (Array.isArray(imgs) && imgs[0]) productThumbnail = String(imgs[0]);
      }
    }
    if (!productTitle) productTitle = "거래 채팅";
    const sellerId = (trade ? roomRow.seller_id : roomRow.initiator_id ?? roomRow.seller_id) ?? "";
    const buyerId = (trade ? roomRow.buyer_id : roomRow.peer_id ?? roomRow.buyer_id) ?? "";
    const userIds = [sellerId, buyerId].filter(Boolean);
    const nickMap = await fetchNicknamesForUserIds(sbAny, userIds);
    const sellerNickname = sellerId ? nickMap.get(sellerId) ?? sellerId.slice(0, 8) : "";
    const buyerNickname = buyerId ? nickMap.get(buyerId) ?? buyerId.slice(0, 8) : "";
    const roomStatus = roomRow.is_locked ? "archived" : roomRow.is_blocked ? "blocked" : "active";
    const moderationLogs = await fetchModerationLogsForRoom(sbAny, roomId);
    return NextResponse.json({
      room,
      participants: participants.data ?? [],
      messages: messages.data ?? [],
      events: events.data ?? [],
      reports: reports.data ?? [],
      moderationLogs,
      item,
      productTitle,
      productThumbnail,
      sellerNickname,
      buyerNickname,
      roomStatus,
      messageCount: (messages.data ?? []).length,
      reportCount: (reports.data ?? []).length,
      purposeKind: trade ? "trade" : roomRow.room_type ?? "general",
    });
  }

  const pc = await sbAny
    .from("product_chats")
    .select(PRODUCT_CHAT_ADMIN_LIST_SELECT)
    .eq("id", roomId)
    .maybeSingle()
    .then((r) => r.data);
  if (!pc) {
    return NextResponse.json({ error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  const pcRow = pc as {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    last_message_preview: string | null;
    last_message_at: string | null;
    created_at: string;
  };
  const { data: msgs } = await sbAny
    .from("product_chat_messages")
    .select("id, sender_id, message_type, content, created_at, is_hidden")
    .eq("product_chat_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);
  const { data: reportRows } = await sbAny
    .from("reports")
    .select(REPORT_ROW_ADMIN_MIN_SELECT)
    .eq("target_type", "chat_room")
    .eq("target_id", roomId);
  const { data: postRaw } = await sbAny.from(POSTS_TABLE_READ).select("id, title, price, status, thumbnail_url, images").eq("id", pcRow.post_id).maybeSingle();
  const post = postRaw as Record<string, unknown> | null;
  const productTitle = typeof post?.title === "string" ? post.title : "";
  let productThumbnail = "";
  if (post) {
    const thumb = post.thumbnail_url;
    const imgs = post.images;
    if (typeof thumb === "string" && thumb.trim()) productThumbnail = thumb.trim();
    else if (Array.isArray(imgs) && imgs[0]) productThumbnail = String(imgs[0]);
  }
  const sellerId = pcRow.seller_id;
  const buyerId = pcRow.buyer_id;
  let sellerNickname = sellerId.slice(0, 8);
  let buyerNickname = buyerId.slice(0, 8);
  const { data: profiles } = await sbAny.from("profiles").select("id, nickname, username").in("id", [sellerId, buyerId]);
  (profiles ?? []).forEach((p: { id: string; nickname?: string; username?: string }) => {
    const name = (p.nickname ?? p.username ?? p.id.slice(0, 8)) as string;
    if (p.id === sellerId) sellerNickname = name;
    if (p.id === buyerId) buyerNickname = name;
  });
  const roomForRes = {
    id: pcRow.id,
    room_type: "item_trade",
    item_id: pcRow.post_id,
    seller_id: pcRow.seller_id,
    buyer_id: pcRow.buyer_id,
    last_message_preview: pcRow.last_message_preview,
    last_message_at: pcRow.last_message_at,
    created_at: pcRow.created_at,
  };
  const messagesForRes = (msgs ?? []).map((m: { id: string; sender_id: string; message_type?: string; content?: string; created_at: string; is_hidden?: boolean }) => ({
    id: m.id,
    sender_id: m.sender_id,
    message_type: m.message_type ?? "text",
    body: m.content ?? "",
    created_at: m.created_at,
    is_hidden_by_admin: m.is_hidden ?? false,
  }));
  const reportsForRes = (reportRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    reporter_user_id: r.reporter_id,
    reason_type: r.reason_code,
    reason_detail: r.reason_text,
    status: r.status,
    created_at: r.created_at,
  }));
  const effectiveChatRoomId = await resolveChatRoomId(sbAny, roomId);
  const moderationLogs = effectiveChatRoomId
    ? await fetchModerationLogsForRoom(sbAny, effectiveChatRoomId)
    : [];
  let roomStatus: "active" | "blocked" | "archived" = "active";
  let linkedReadonly = false;
  if (effectiveChatRoomId) {
    const { data: crFlags } = await sbAny
      .from("chat_rooms")
      .select("is_locked, is_blocked, is_readonly")
      .eq("id", effectiveChatRoomId)
      .maybeSingle();
    const f = crFlags as { is_locked?: boolean; is_blocked?: boolean; is_readonly?: boolean } | null;
    if (f?.is_locked) roomStatus = "archived";
    else if (f?.is_blocked) roomStatus = "blocked";
    linkedReadonly = f?.is_readonly === true;
  }
  const roomForApi = { ...roomForRes, is_readonly: linkedReadonly };
  return NextResponse.json({
    room: roomForApi,
    participants: [],
    messages: messagesForRes,
    events: [],
    reports: reportsForRes,
    moderationLogs,
    item: post ?? null,
    productTitle,
    productThumbnail,
    sellerNickname,
    buyerNickname,
    roomStatus,
    messageCount: messagesForRes.length,
    reportCount: reportsForRes.length,
  });
}
