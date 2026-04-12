/**
 * 채팅 메시지 전송 (서비스 롤)
 * POST body: { text?, messageType?, imageUrl?, imageUrls? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import {
  ADMIN_CHAT_SUSPENDED_MESSAGE,
  fetchItemTradeAdminSuspended,
} from "@/lib/chat/chat-room-admin-suspend";
import {
  buildProductChatImageContent,
  normalizeIncomingImageUrlList,
} from "@/lib/chats/chat-image-bundle";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import { parseRoomId } from "@/lib/validate-params";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const { roomId: rawRoomId } = await params;
  const roomId = parseRoomId(rawRoomId);
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  let body: { text?: string; messageType?: string; imageUrl?: string | null; imageUrls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "본문 필요" }, { status: 400 });
  }
  const text = String(body.text ?? "").trim();
  const rawType = String(body.messageType ?? "text").toLowerCase();
  const messageType =
    rawType === "system" ? "system" : rawType === "image" ? "image" : "text";
  const imageList = normalizeIncomingImageUrlList({
    imageUrl: body.imageUrl,
    imageUrls: body.imageUrls,
  });
  if (messageType === "image") {
    if (imageList.length === 0) {
      return NextResponse.json({ ok: false, error: "이미지 URL이 필요합니다." }, { status: 400 });
    }
  } else if (!text && messageType === "text") {
    return NextResponse.json({ ok: false, error: "메시지를 입력하세요" }, { status: 400 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const [access, { data: room, error: roomErr }] = await Promise.all([
    assertVerifiedMemberForAction(sbAny, userId),
    sbAny
      .from("product_chats")
      .select(
        "id, post_id, seller_id, buyer_id, unread_count_seller, unread_count_buyer, trade_flow_status, chat_mode"
      )
      .eq("id", roomId)
      .maybeSingle(),
  ]);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  if (roomErr || !room) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  if (room.seller_id !== userId && room.buyer_id !== userId) {
    return NextResponse.json({ ok: false, error: "참여자만 메시지를 보낼 수 있습니다." }, { status: 403 });
  }

  const postId = String((room as { post_id?: string }).post_id ?? "").trim();
  if (
    postId &&
    (await fetchItemTradeAdminSuspended(sbAny, postId, room.seller_id as string, room.buyer_id as string))
  ) {
    return NextResponse.json({ ok: false, error: ADMIN_CHAT_SUSPENDED_MESSAGE }, { status: 403 });
  }

  const mode = String((room as { chat_mode?: string }).chat_mode ?? "open");
  if (mode === "limited" || mode === "readonly") {
    return NextResponse.json(
      { ok: false, error: "이 채팅은 제한 모드라 메시지를 보낼 수 없습니다." },
      { status: 409 }
    );
  }

  const content =
    messageType === "system"
      ? text || "(시스템)"
      : messageType === "image"
        ? buildProductChatImageContent(imageList, text)
        : text;
  const { data: msg, error: msgErr } = await sbAny
    .from("product_chat_messages")
    .insert({
      product_chat_id: roomId,
      sender_id: userId,
      message_type: messageType,
      content,
      image_url: messageType === "image" ? imageList[0] ?? null : null,
    })
    .select("id, created_at")
    .single();

  if (msgErr) {
    return NextResponse.json({ ok: false, error: msgErr.message ?? "전송 실패" }, { status: 500 });
  }

  const preview =
    messageType === "system"
      ? "거래 상태 안내"
      : messageType === "image"
        ? text
          ? text.slice(0, 100)
          : imageList.length > 1
            ? `사진 ${imageList.length}장`
            : "사진"
        : text.slice(0, 100);
  const isSeller = room.seller_id === userId;
  const updates: Record<string, unknown> = {
    last_message_at: msg?.created_at ?? new Date().toISOString(),
    last_message_preview: preview,
    updated_at: new Date().toISOString(),
  };
  if (isSeller) {
    updates.unread_count_buyer = (room.unread_count_buyer ?? 0) + 1;
  } else {
    updates.unread_count_seller = (room.unread_count_seller ?? 0) + 1;
  }

  const otherId = isSeller ? room.buyer_id : room.seller_id;
  await Promise.all([
    sbAny.from("product_chats").update(updates).eq("id", roomId),
    (async () => {
      try {
        await sbAny.from("notifications").insert({
          user_id: otherId,
          notification_type: "chat",
          title: "새 메시지",
          body: preview,
          link_url: tradeChatNotificationHref(roomId, "product_chat"),
          is_read: false,
        });
      } catch {
        /* ignore: notifications.user_id FK 등으로 실패 가능 */
      }
    })(),
  ]);

  return NextResponse.json({
    ok: true,
    messageId: msg?.id ?? "",
    createdAt: msg?.created_at ?? new Date().toISOString(),
  });
}
