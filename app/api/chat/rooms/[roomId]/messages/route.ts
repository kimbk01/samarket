/**
 * GET /api/chat/rooms/:roomId/messages — 메시지 목록 (세션)
 * POST /api/chat/rooms/:roomId/messages — 메시지 전송 (body: body, messageType?)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { touchProductChatAfterItemTradeMessage } from "@/lib/trade/touch-product-chat-from-item-trade-room";
import { shouldBlockItemTradeMessagingForReservation } from "@/lib/trade/reserved-item-chat";
import {
  ADMIN_CHAT_SUSPENDED_MESSAGE,
  resolveAdminChatSuspension,
} from "@/lib/chat/chat-room-admin-suspend";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  const before = req.nextUrl.searchParams.get("before")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
  if (!roomId) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: part } = await sbAny
    .from("chat_room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("hidden", false)
    .maybeSingle();
  if (!part) {
    return NextResponse.json({ error: "참여자만 조회할 수 있습니다." }, { status: 403 });
  }

  let q = sbAny
    .from("chat_messages")
    .select("id, room_id, sender_id, message_type, body, metadata, deleted_by_sender, is_hidden_by_admin, created_at, read_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) {
    const { data: beforeRow } = await sbAny.from("chat_messages").select("created_at").eq("id", before).maybeSingle();
    if (beforeRow && typeof (beforeRow as { created_at: string }).created_at === "string") {
      q = q.lt("created_at", (beforeRow as { created_at: string }).created_at);
    }
  }
  const { data: messages, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = (messages ?? []).reverse();
  return NextResponse.json({ messages: list });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  let body: { body?: string; messageType?: string; imageUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body 필요" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const messageType = (["text", "image", "system", "item_card", "appointment", "safety_notice"] as const).includes(body.messageType as never)
    ? body.messageType
    : "text";
  const imageUrl =
    typeof body.imageUrl === "string" && body.imageUrl.trim().length > 0
      ? body.imageUrl.trim()
      : "";
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }
  if (messageType === "image") {
    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "이미지 주소가 필요합니다." }, { status: 400 });
    }
  } else if (!text && messageType === "text") {
    return NextResponse.json({ ok: false, error: "메시지를 입력하세요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: room } = await sbAny
    .from("chat_rooms")
    .select(
      "id, room_type, item_id, is_blocked, blocked_by, is_locked, is_readonly, seller_id, buyer_id, initiator_id, peer_id, request_status"
    )
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  const r = room as {
    is_blocked: boolean;
    blocked_by: string | null;
    is_locked: boolean;
    is_readonly?: boolean;
    request_status: string;
    seller_id: string | null;
    buyer_id: string | null;
    initiator_id: string | null;
    peer_id: string | null;
  };
  const adminSuspend = resolveAdminChatSuspension(r);
  if (adminSuspend.suspended) {
    return NextResponse.json({ ok: false, error: ADMIN_CHAT_SUSPENDED_MESSAGE }, { status: 403 });
  }
  if (r.is_readonly === true) {
    return NextResponse.json({ ok: false, error: "읽기 전용 채팅방입니다." }, { status: 403 });
  }
  if (r.is_blocked) {
    const blocker = r.blocked_by;
    if (blocker && userId !== blocker) {
      const { data: blockRow } = await sbAny
        .from("user_blocks")
        .select("id")
        .eq("user_id", blocker)
        .eq("blocked_user_id", userId)
        .maybeSingle();
      if (blockRow?.id) {
        return NextResponse.json({ ok: false, error: "상대와 대화할 수 없어요." }, { status: 403 });
      }
    }
  }
  const { data: part } = await sbAny
    .from("chat_room_participants")
    .select("id, hidden, left_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  const partRow = part as { hidden?: boolean; left_at?: string | null };
  if (partRow.hidden || partRow.left_at) {
    return NextResponse.json({ ok: false, error: "참여자만 메시지를 보낼 수 있습니다." }, { status: 403 });
  }
  if (r.request_status === "pending") {
    return NextResponse.json({ ok: false, error: "채팅이 승인된 후에 메시지를 보낼 수 있어요." }, { status: 403 });
  }

  const roomTrade = room as {
    room_type?: string;
    item_id?: string | null;
    buyer_id?: string | null;
  };
  if (roomTrade.room_type === "item_trade" && roomTrade.item_id) {
    const { data: postRow } = await sbAny
      .from("posts")
      .select("*")
      .eq("id", roomTrade.item_id)
      .maybeSingle();
    if (
      shouldBlockItemTradeMessagingForReservation(
        postRow as Record<string, unknown> | null,
        roomTrade.buyer_id
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "이 상품은 다른 분과 예약 중입니다. 예약된 분과의 채팅만 이어갈 수 있어요.",
        },
        { status: 403 }
      );
    }
  }

  const bodyText =
    messageType === "image" ? text || "사진" : text || "(메시지)";
  const metadata =
    messageType === "image" ? { imageUrl } : ({} as Record<string, unknown>);

  const { data: msg, error: insertErr } = await sbAny
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: userId,
      message_type: messageType,
      body: bodyText,
      metadata,
    })
    .select("id, created_at")
    .single();

  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message ?? "전송 실패" }, { status: 500 });
  }
  const now = (msg as { created_at: string }).created_at ?? new Date().toISOString();
  const preview =
    messageType === "image" ? (text ? text.slice(0, 100) : "사진") : text.slice(0, 100);
  await sbAny
    .from("chat_rooms")
    .update({
      last_message_id: (msg as { id: string }).id,
      last_message_at: now,
      last_message_preview: preview,
      updated_at: now,
    })
    .eq("id", roomId);

  const roomAny = room as {
    room_type?: string;
    item_id?: string | null;
    seller_id: string | null;
    buyer_id: string | null;
    last_message_at?: string | null;
    last_message_preview?: string | null;
  };
  if (roomAny.room_type === "item_trade" && roomAny.item_id && roomAny.seller_id && roomAny.buyer_id) {
    try {
      await touchProductChatAfterItemTradeMessage(
        sbAny,
        {
          item_id: roomAny.item_id,
          seller_id: roomAny.seller_id,
          buyer_id: roomAny.buyer_id,
          last_message_at: now,
          last_message_preview: preview,
        },
        userId
      );
    } catch {
      /* product_chats FK·스키마 이슈 시 채팅 전송은 유지 */
    }
  }

  const roomR = room as { seller_id: string | null; buyer_id: string | null; initiator_id: string; peer_id: string | null };
  const otherIds = [roomR.seller_id, roomR.buyer_id, roomR.initiator_id, roomR.peer_id].filter(Boolean) as string[];
  const otherId = otherIds.find((id) => id !== userId);
  if (otherId) {
    const { data: otherPart } = await sbAny
      .from("chat_room_participants")
      .select("id, unread_count")
      .eq("room_id", roomId)
      .eq("user_id", otherId)
      .maybeSingle();
    if (otherPart) {
      const current = (otherPart as { unread_count: number }).unread_count ?? 0;
      await sbAny
        .from("chat_room_participants")
        .update({
          unread_count: current + 1,
          hidden: false,
          left_at: null,
          updated_at: now,
        })
        .eq("room_id", roomId)
        .eq("user_id", otherId);
    }
    try {
      await sbAny.from("notification_logs").insert({
        room_id: roomId,
        user_id: otherId,
        notification_type: "new_message",
        delivery_channel: "push",
        status: "queued",
        payload_summary: preview,
        created_at: now,
      });
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    ok: true,
    message: { id: (msg as { id: string }).id, createdAt: now },
  });
}
