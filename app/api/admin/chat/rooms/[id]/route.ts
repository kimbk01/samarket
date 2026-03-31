/**
 * GET /api/admin/chat/rooms/:id — 관리자 채팅방 상세 (관리자 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { resolveChatRoomId } from "@/lib/admin-chats/resolve-chat-room-id";
import { fetchModerationLogsForRoom } from "@/lib/admin-chats/fetch-moderation-logs-for-room";

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

  const room = await sbAny.from("chat_rooms").select("*").eq("id", roomId).maybeSingle().then((r) => r.data);

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
    const [participants, messages, events, reports] = await Promise.all([
      sbAny.from("chat_room_participants").select("*").eq("room_id", roomId),
      sbAny.from("chat_messages").select("id, sender_id, message_type, body, created_at, is_hidden_by_admin").eq("room_id", roomId).order("created_at", { ascending: true }).limit(200),
      sbAny.from("chat_event_logs").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(100),
      sbAny.from("chat_reports").select("*").eq("room_id", roomId),
    ]);
    let item: Record<string, unknown> | null = null;
    let productTitle = "";
    let productThumbnail = "";
    const trade = roomRow.room_type === "item_trade";
    const postIdForCard = roomRow.item_id ?? roomRow.related_post_id ?? null;
    if (postIdForCard) {
      const { data: post } = await sbAny
        .from("posts")
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
    if (!productTitle) {
      const rt = roomRow.room_type ?? "";
      if (rt === "community") productTitle = "커뮤니티 문의";
      else if (rt === "group") productTitle = `모임·게시판 (${(roomRow.related_group_id ?? "").slice(0, 8)}…)`;
      else if (rt === "business") productTitle = `비즈·상점 (${(roomRow.related_business_id ?? "").slice(0, 8)}…)`;
      else if (rt === "general_chat")
        productTitle = roomRow.context_type ? `일반(${roomRow.context_type})` : "일반 채팅";
    }
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

  const openRoomRaw = await sbAny
    .from("meeting_open_chat_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle()
    .then((r) => r.data);

  if (openRoomRaw) {
    const mor = openRoomRaw as {
      id: string;
      meeting_id: string;
      title: string;
      thumbnail_url: string | null;
      owner_user_id: string;
      last_message_preview: string | null;
      last_message_at: string | null;
      created_at: string;
      is_active: boolean;
      active_member_count: number;
    };
    const [{ data: msgsRaw }, { data: reportsRaw }] = await Promise.all([
      sbAny
        .from("meeting_open_chat_messages")
        .select("id, user_id, member_id, message_type, content, created_at, is_blinded")
        .eq("room_id", roomId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200),
      sbAny.from("meeting_open_chat_reports").select("*").eq("room_id", roomId),
    ]);
    const msgs = (msgsRaw ?? []) as {
      id: string;
      user_id: string | null;
      member_id: string | null;
      message_type: string;
      content: string;
      created_at: string;
      is_blinded: boolean;
    }[];
    const msgIds = msgs.map((m) => m.id);
    let attByMessageId: Record<string, { file_type: string; file_url: string }[]> = {};
    if (msgIds.length > 0) {
      const { data: atts } = await sbAny
        .from("meeting_open_chat_attachments")
        .select("message_id, file_type, file_url, sort_order")
        .in("message_id", msgIds);
      for (const a of atts ?? []) {
        const row = a as { message_id: string; file_type: string; file_url: string; sort_order?: number };
        if (!attByMessageId[row.message_id]) attByMessageId[row.message_id] = [];
        attByMessageId[row.message_id].push({ file_type: row.file_type, file_url: row.file_url });
      }
    }
    const ownerNick =
      (await fetchNicknamesForUserIds(sbAny, [mor.owner_user_id])).get(mor.owner_user_id) ??
      mor.owner_user_id.slice(0, 8);

    let meetingTitle = "";
    const { data: meet } = await sbAny.from("meetings").select("id, title").eq("id", mor.meeting_id).maybeSingle();
    if (meet && typeof (meet as { title?: string }).title === "string") {
      meetingTitle = ((meet as { title: string }).title ?? "").trim();
    }
    const productTitle = meetingTitle ? `${mor.title} · ${meetingTitle}` : mor.title;
    const productThumbnail = (mor.thumbnail_url ?? "").trim();

    const messagesForRes = msgs.map((m) => {
      const extras = attByMessageId[m.id] ?? [];
      const extraText =
        extras.length > 0
          ? extras.map((e) => `[${e.file_type}:${e.file_url}]`).join("\n")
          : "";
      const body = [m.content?.trim() || "", extraText].filter(Boolean).join("\n");
      const mt = m.message_type === "image" || m.message_type === "system" ? m.message_type : "text";
      return {
        id: m.id,
        sender_id: m.user_id ?? "",
        message_type: mt,
        body,
        created_at: m.created_at,
        is_hidden_by_admin: m.is_blinded,
      };
    });

    const reportsForRes = (reportsRaw ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      reporter_user_id: r.reporter_user_id,
      reason_type: r.report_reason,
      reason_detail: r.report_detail,
      status: r.status,
      created_at: r.created_at,
    }));

    const roomForApi = {
      id: mor.id,
      room_type: "meeting_open_chat",
      meeting_id: mor.meeting_id,
      item_id: null as string | null,
      seller_id: mor.owner_user_id,
      buyer_id: null as string | null,
      initiator_id: mor.owner_user_id,
      peer_id: null as string | null,
      last_message_preview: mor.last_message_preview,
      last_message_at: mor.last_message_at,
      created_at: mor.created_at,
      is_readonly: true,
      is_blocked: !mor.is_active,
      is_locked: false,
    };

    const roomStatus: "active" | "blocked" | "archived" = mor.is_active ? "active" : "blocked";

    return NextResponse.json({
      room: roomForApi,
      participants: [],
      messages: messagesForRes,
      events: [],
      reports: reportsForRes,
      moderationLogs: [],
      item: null,
      productTitle,
      productThumbnail,
      sellerNickname: ownerNick,
      buyerNickname: `참여 ${mor.active_member_count}명`,
      roomStatus,
      messageCount: messagesForRes.length,
      reportCount: reportsForRes.length,
      purposeKind: "meeting_open_chat",
    });
  }

  const pc = await sbAny.from("product_chats").select("*").eq("id", roomId).maybeSingle().then((r) => r.data);
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
    .select("*")
    .eq("target_type", "chat_room")
    .eq("target_id", roomId);
  const { data: postRaw } = await sbAny.from("posts").select("id, title, price, status, thumbnail_url, images").eq("id", pcRow.post_id).maybeSingle();
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
