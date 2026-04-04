/**
 * GET /api/chat/rooms/:roomId/messages — 메시지 목록 (세션)
 * POST /api/chat/rooms/:roomId/messages — 메시지 전송 (body: body, messageType?)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { touchProductChatAfterItemTradeMessage } from "@/lib/trade/touch-product-chat-from-item-trade-room";
import { shouldBlockItemTradeMessagingForReservation } from "@/lib/trade/reserved-item-chat";
import {
  ADMIN_CHAT_SUSPENDED_MESSAGE,
  resolveAdminChatSuspension,
} from "@/lib/chat/chat-room-admin-suspend";
import { normalizeIncomingImageUrlList } from "@/lib/chats/chat-image-bundle";
import { resolvePhilifeMeetingAccessMeetingId } from "@/lib/chats/philife/room-access";
import { bumpUnreadForChatRoomRecipients } from "@/lib/chats/chat-room-unread";

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

  const { data: roomForGet } = await sb
    .from("chat_rooms")
    .select("id, room_type, meeting_id, related_group_id, buyer_id, seller_id, store_order_id")
    .eq("id", roomId)
    .maybeSingle();
  const hasDbChatRoom = !!(roomForGet as { id?: string } | null)?.id;

  if (!hasDbChatRoom && process.env.NODE_ENV !== "production") {
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        inquiryRooms?: Array<{ id: string; initiator_id: string; peer_id: string }>;
        chatMessages?: Map<string, Array<{
          id: string;
          roomId: string;
          senderId: string;
          messageType?: string;
          message: string;
          createdAt: string;
          readAt: string | null;
        }>>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const inquiry = state?.inquiryRooms?.find(
      (room) => room.id === roomId && (room.initiator_id === userId || room.peer_id === userId)
    );
    if (inquiry) {
      const list = (state?.chatMessages?.get(roomId) ?? []).map((message) => ({
        id: message.id,
        room_id: roomId,
        sender_id: message.senderId,
        message_type: message.messageType ?? "text",
        body: message.message,
        created_at: message.createdAt,
        read_at: message.readAt,
      }));
      return NextResponse.json({ messages: list });
    }
  }

  const sbAny = sb;
  const rtGet = (roomForGet as { room_type?: string } | null)?.room_type ?? "";

  /* 구 모임 chat_rooms 축은 제거됨 */
  const philifeMeetingIdGet = await resolvePhilifeMeetingAccessMeetingId(
    sbAny,
    roomId,
    roomForGet as { room_type?: string | null; meeting_id?: string | null; related_group_id?: string | null }
  );
  if (philifeMeetingIdGet) {
    return NextResponse.json({ error: "삭제된 모임 채팅입니다." }, { status: 404 });
  } else if (rtGet === "store_order") {
    return NextResponse.json({ error: "주문 채팅은 주문 전용 경로로 이동했습니다." }, { status: 404 });
  } else {
    const { data: part } = await sbAny
      .from("chat_room_participants")
      .select("id, hidden, left_at, is_active")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const prGet = part as { hidden?: boolean; left_at?: string | null; is_active?: boolean | null } | null;
    if (!prGet || prGet.hidden || prGet.left_at || prGet.is_active === false) {
      return NextResponse.json({ error: "참여자만 조회할 수 있습니다." }, { status: 403 });
    }
  }

  let q = sbAny
    .from("chat_messages")
    .select("id, room_id, sender_id, message_type, body, metadata, deleted_by_sender, is_hidden_by_admin, hidden_reason, created_at, read_at")
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
  const list = ((messages ?? []) as Array<Record<string, unknown>>)
    .reverse()
    .filter((message) => message.deleted_by_sender !== true);
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
  let body: { body?: string; messageType?: string; imageUrl?: string | null; imageUrls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body 필요" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const messageType = (["text", "image", "system", "item_card", "appointment", "safety_notice"] as const).includes(body.messageType as never)
    ? body.messageType
    : "text";
  const imageList = normalizeIncomingImageUrlList({
    imageUrl: body.imageUrl,
    imageUrls: body.imageUrls,
  });
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }
  if (messageType === "image") {
    if (imageList.length === 0) {
      return NextResponse.json({ ok: false, error: "이미지 주소가 필요합니다." }, { status: 400 });
    }
  } else if (!text && messageType === "text") {
    return NextResponse.json({ ok: false, error: "메시지를 입력하세요" }, { status: 400 });
  }

  const { data: room, error: roomFetchErr } = await sb
    .from("chat_rooms")
    .select(
      "id, room_type, item_id, meeting_id, related_group_id, is_blocked, blocked_by, is_locked, is_readonly, seller_id, buyer_id, initiator_id, peer_id, request_status, store_order_id"
    )
    .eq("id", roomId)
    .maybeSingle();
  const hasDbChatRoomPost = !!(room as { id?: string } | null)?.id && !roomFetchErr;

  if (!hasDbChatRoomPost && !roomFetchErr && process.env.NODE_ENV !== "production") {
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        inquiryRooms?: Array<{ id: string; initiator_id: string; peer_id: string }>;
        chatMessages?: Map<string, Array<{
          id: string;
          roomId: string;
          senderId: string;
          message: string;
          messageType?: string;
          createdAt: string;
          isRead: boolean;
          readAt: string | null;
        }>>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const inquiry = state?.inquiryRooms?.find(
      (room) => room.id === roomId && (room.initiator_id === userId || room.peer_id === userId)
    );
    if (inquiry && state?.chatMessages) {
      const next = {
        id: `${roomId}-${Date.now()}`,
        roomId,
        senderId: userId,
        message: messageType === "image" ? text || (imageList.length > 1 ? `사진 ${imageList.length}장` : "사진") : text || "(메시지)",
        messageType: messageType === "system" ? "system" : messageType === "image" ? "image" : "text",
        createdAt: new Date().toISOString(),
        isRead: false,
        readAt: null,
      };
      const current = state.chatMessages.get(roomId) ?? [];
      current.push(next);
      state.chatMessages.set(roomId, current);
      return NextResponse.json({
        ok: true,
        message: { id: next.id, createdAt: next.createdAt },
        fallback: "dev_samples",
      });
    }
  }

  const sbAny = sb;
  const access = await assertVerifiedMemberForAction(sbAny as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  if (roomFetchErr || !room) {
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
  const roomTypeSend = String((room as { room_type?: string }).room_type ?? "");
  const adminSuspend = resolveAdminChatSuspension(r);
  /** 매장 주문 채팅은 완료 후에도 연락이 필요해 `is_locked`(보관 플래그)만으로는 전송을 막지 않음 — 읽기 전용은 `is_readonly` */
  const bypassLockForStoreOrder =
    roomTypeSend === "store_order" && adminSuspend.reason === "admin_locked";
  if (adminSuspend.suspended && !bypassLockForStoreOrder) {
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
  const roomForGm = room as { room_type?: string; meeting_id?: string | null; related_group_id?: string | null };
  const philifeMeetingIdPost = await resolvePhilifeMeetingAccessMeetingId(sbAny, roomId, roomForGm);
  if (philifeMeetingIdPost) {
    return NextResponse.json({ ok: false, error: "삭제된 모임 채팅입니다." }, { status: 404 });
  } else if (roomForGm.room_type === "store_order") {
    return NextResponse.json({ ok: false, error: "주문 채팅은 주문 전용 경로로 이동했습니다." }, { status: 404 });
  } else {
    const { data: part } = await sbAny
      .from("chat_room_participants")
      .select("id, hidden, left_at, is_active")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    const partRow = part as { hidden?: boolean; left_at?: string | null; is_active?: boolean | null } | null;
    if (!partRow || partRow.hidden || partRow.left_at || partRow.is_active === false) {
      return NextResponse.json({ ok: false, error: "참여자만 메시지를 보낼 수 있습니다." }, { status: 403 });
    }
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
      .select("id, status, seller_listing_state, reserved_buyer_id")
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
    messageType === "image"
      ? text || (imageList.length > 1 ? `사진 ${imageList.length}장` : "사진")
      : text || "(메시지)";
  const metadata: Record<string, unknown> =
    messageType === "image"
      ? imageList.length > 1
        ? { imageUrls: imageList, imageUrl: imageList[0] }
        : { imageUrl: imageList[0] }
      : {};

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
  const msgId = (msg as { id: string }).id;
  const preview =
    messageType === "image"
      ? text
        ? text.slice(0, 100)
        : imageList.length > 1
          ? `사진 ${imageList.length}장`
          : "사진"
      : text.slice(0, 100);

  const roomAny = room as {
    room_type?: string;
    item_id?: string | null;
    seller_id: string | null;
    buyer_id: string | null;
    last_message_at?: string | null;
    last_message_preview?: string | null;
  };
  const updateRoomPromise = sbAny
    .from("chat_rooms")
    .update({
      last_message_id: msgId,
      last_message_at: now,
      last_message_preview: preview,
      updated_at: now,
    })
    .eq("id", roomId);

  const touchLegacyPromise =
    roomAny.room_type === "item_trade" && roomAny.item_id && roomAny.seller_id && roomAny.buyer_id
      ? touchProductChatAfterItemTradeMessage(
          sbAny,
          {
            item_id: roomAny.item_id,
            seller_id: roomAny.seller_id,
            buyer_id: roomAny.buyer_id,
            last_message_at: now,
            last_message_preview: preview,
          },
          userId
        ).catch(() => {
          /* product_chats FK·스키마 이슈 시 채팅 전송은 유지 */
        })
      : Promise.resolve();

  const bumpOtherPromise = bumpUnreadForChatRoomRecipients(sbAny, roomId, userId, now, preview);

  await Promise.all([updateRoomPromise, touchLegacyPromise, bumpOtherPromise]);

  return NextResponse.json({
    ok: true,
    message: {
      id: (msg as { id: string }).id,
      createdAt: now,
    },
  });
}
