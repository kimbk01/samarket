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
import { bumpUnreadForChatRoomRecipients } from "@/lib/chats/chat-room-unread";
import { notifyTradeChatInAppForRecipients } from "@/lib/notifications/trade-chat-inapp-notify";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
  safeErrorMessage,
} from "@/lib/http/api-route";
import { loadIntegratedChatRoomMessageRowsForUser } from "@/lib/chats/server/load-chat-room-messages";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }
  const result = await loadIntegratedChatRoomMessageRowsForUser({
    roomId,
    userId: auth.userId,
    before: req.nextUrl.searchParams.get("before"),
    limit: Number(req.nextUrl.searchParams.get("limit")) || 50,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ messages: result.value });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const sendRateLimit = await enforceRateLimit({
    key: `trade-chat:message-send:${getRateLimitKey(req, userId)}`,
    limit: 24,
    windowMs: 60_000,
    message: "메시지 전송이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "trade_chat_message_rate_limited",
  });
  if (!sendRateLimit.ok) return sendRateLimit.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("서버 설정 필요", 500);
  }
  const { roomId } = await params;
  const parsed = await parseJsonBody<{
    body?: string;
    messageType?: string;
    imageUrl?: string | null;
    imageUrls?: unknown;
  }>(req, "body 필요");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const messageType = (["text", "image", "system", "item_card", "appointment", "safety_notice"] as const).includes(body.messageType as never)
    ? body.messageType
    : "text";
  const imageList = normalizeIncomingImageUrlList({
    imageUrl: body.imageUrl,
    imageUrls: body.imageUrls,
  });
  if (!roomId) {
    return jsonError("roomId 필요", 400);
  }
  if (messageType === "image") {
    if (imageList.length === 0) {
      return jsonError("이미지 주소가 필요합니다.", 400);
    }
  } else if (!text && messageType === "text") {
    return jsonError("메시지를 입력하세요", 400);
  }

  const { data: room, error: roomFetchErr } = await sb
    .from("chat_rooms")
    .select(
      "id, room_type, item_id, meeting_id, related_group_id, is_blocked, blocked_by, is_locked, is_readonly, seller_id, buyer_id, initiator_id, peer_id, request_status, store_order_id"
    )
    .eq("id", roomId)
    .maybeSingle();
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
  const roomTypePost = String((room as { room_type?: string }).room_type ?? "");
  if (roomTypePost === "store_order") {
    return NextResponse.json({ ok: false, error: "주문 채팅은 주문 전용 경로로 이동했습니다." }, { status: 404 });
  }
  if (roomTypePost !== "item_trade") {
    return NextResponse.json({ ok: false, error: "삭제된 채팅 유형입니다." }, { status: 404 });
  }
  {
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
    return jsonError(safeErrorMessage(insertErr, "전송에 실패했습니다."), 500, {
      code: "trade_chat_message_insert_failed",
    });
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

  const bumpAndNotifyPromise = (async () => {
    const { recipientUserIds } = await bumpUnreadForChatRoomRecipients(
      sbAny,
      roomId,
      userId,
      now,
      preview
    );
    await notifyTradeChatInAppForRecipients(sbAny, {
      roomId,
      senderUserId: userId,
      preview,
      recipientUserIds,
    });
  })();

  await Promise.all([updateRoomPromise, touchLegacyPromise, bumpAndNotifyPromise]);

  return jsonOk({
    message: {
      id: (msg as { id: string }).id,
      createdAt: now,
    },
  });
}
