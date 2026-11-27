/**
 * 채팅 메시지 전송 (서비스 롤)
 * POST body: { text?, messageType?, imageUrl?, imageUrls? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  ADMIN_CHAT_SUSPENDED_CODE,
  fetchItemTradeAdminSuspended,
} from "@/lib/chat/chat-room-admin-suspend";
import { tradeApiError } from "@/lib/trade/trade-api-error-response";
import {
  TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE,
  TRADE_CHAT_PREVIEW_TOKEN_SYSTEM,
  tradeChatPhotoPreviewToken,
} from "@/lib/trade/trade-api-error-text";
import {
  buildProductChatImageContent,
  normalizeIncomingImageUrlList,
} from "@/lib/chats/chat-image-bundle";
import { notifyMessagePipeline } from "@/lib/notifications/pipeline/notify-message-pipeline";
import { parseRoomId } from "@/lib/validate-params";
import { enforceTradeChatSendQuota } from "@/lib/security/rate-limit-presets";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { guardBannedWords } from "@/lib/community-feed/banned-word-guard.server";
import { syncPostInquiryNegotiatingFromItemTradeChats } from "@/lib/trade/maybe-auto-promote-trade-listing-negotiating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId: rawRoomId } = await params;
  const roomId = parseRoomId(rawRoomId);
  if (!roomId) {
    return tradeApiError("invalid_request", 400);
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const sendRl = await enforceTradeChatSendQuota(userId, roomId);
  if (!sendRl.ok) return sendRl.response;

  let body: { text?: string; messageType?: string; imageUrl?: string | null; imageUrls?: unknown };
  try {
    body = await req.json();
  } catch {
    return tradeApiError("invalid_request", 400);
  }
  const text = String(body.text ?? "").trim();
  const rawType = String(body.messageType ?? "text").toLowerCase();
  const messageType =
    rawType === "system" ? "system" : rawType === "image" ? "image" : "text";
  const imageList = normalizeIncomingImageUrlList({
    imageUrl: body.imageUrl,
    imageUrls: body.imageUrls,
    ownerUid: userId,
  });
  if (messageType === "image") {
    if (imageList.length === 0) {
      return tradeApiError("image_required", 400);
    }
  } else if (!text && messageType === "text") {
    return tradeApiError("message_required", 400);
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return tradeApiError("service_unavailable", 500);
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const [access, { data: room, error: roomErr }] = await Promise.all([
    assertVerifiedMemberForAction(sbAny, userId),
    sbAny
      .from("product_chats")
      .select(
        "id, post_id, seller_id, buyer_id, unread_count_seller, unread_count_buyer, trade_flow_status, chat_mode, seller_left_at, buyer_left_at"
      )
      .eq("id", roomId)
      .maybeSingle(),
  ]);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  if (roomErr || !room) {
    return tradeApiError("chat_room_not_found", 404);
  }
  if (room.seller_id !== userId && room.buyer_id !== userId) {
    return tradeApiError("not_participant", 403);
  }
  const leftRow = room as { seller_left_at?: string | null; buyer_left_at?: string | null };
  if (room.seller_id === userId && leftRow.seller_left_at) {
    return tradeApiError("chat_room_left", 403);
  }
  if (room.buyer_id === userId && leftRow.buyer_left_at) {
    return tradeApiError("chat_room_left", 403);
  }
  if (room.buyer_id === userId && leftRow.seller_left_at) {
    return tradeApiError("seller_left_chat", 403);
  }

  const postId = String((room as { post_id?: string }).post_id ?? "").trim();
  if (
    postId &&
    (await fetchItemTradeAdminSuspended(sbAny, postId, room.seller_id as string, room.buyer_id as string))
  ) {
    return tradeApiError(ADMIN_CHAT_SUSPENDED_CODE, 403);
  }

  const mode = String((room as { chat_mode?: string }).chat_mode ?? "open");
  if (mode === "limited" || mode === "readonly") {
    return tradeApiError("chat_limited_mode", 409);
  }

  const peerUserId = String((room.seller_id === userId ? room.buyer_id : room.seller_id) ?? "").trim();
  if (peerUserId && (await isBlockedEitherWay(userId, peerUserId))) {
    return tradeApiError("peer_blocked", 403);
  }

  if (messageType !== "system" && text) {
    const filtered = await guardBannedWords({
      userId,
      surface: "trade_chat",
      texts: [text],
      acceptLanguage: req.headers.get("accept-language"),
    });
    if (!filtered.ok) {
      return NextResponse.json({ ok: false, error: filtered.error, code: filtered.code }, { status: filtered.status });
    }
  }

  const content =
    messageType === "system"
      ? text || TRADE_CHAT_PREVIEW_TOKEN_SYSTEM
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
    console.error("[chat/room/send] insert failed", { code: (msgErr as { code?: string }).code, message: msgErr.message });
    return tradeApiError("send_failed", 500);
  }

  const preview =
    messageType === "system"
      ? TRADE_CHAT_PREVIEW_TOKEN_STATUS_NOTICE
      : messageType === "image"
        ? text
          ? text.slice(0, 100)
          : tradeChatPhotoPreviewToken(imageList.length)
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
  await sbAny.from("product_chats").update(updates).eq("id", roomId);

  if (otherId && msg?.id) {
    void notifyMessagePipeline(sbAny, {
      roomId,
      messageId: String(msg.id),
      senderUserId: userId,
      preview,
      recipientUserIds: [otherId],
      roomKind: "trade_legacy",
    }).catch(() => {});
  }

  if (postId) {
    void syncPostInquiryNegotiatingFromItemTradeChats(sbAny, postId).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    messageId: msg?.id ?? "",
    createdAt: msg?.created_at ?? new Date().toISOString(),
  });
}
