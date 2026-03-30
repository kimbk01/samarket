"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTestAuth } from "@/lib/auth/test-auth-store";
import { buildProductChatImageContent } from "@/lib/chats/chat-image-bundle";

export type SendChatMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** 메시지 타입 */
export type MessagePayloadType = "text" | "image";

export type ChatImageSendPayload =
  | { type: "text"; text: string }
  | { type: "image"; text: string; imageUrl?: string; imageUrls?: string[] };

function imageUrlListFromPayload(p: ChatImageSendPayload): string[] {
  if (p.type !== "image") return [];
  if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) {
    return [...new Set(p.imageUrls.map((u) => u.trim()).filter(Boolean))];
  }
  const one = p.imageUrl?.trim() ?? "";
  return one ? [one] : [];
}

/** 테스트 로그인 시 서버 API로 전송 (RLS 우회) */
async function sendMessageViaApi(
  roomId: string,
  _userId: string,
  payload: ChatImageSendPayload
): Promise<SendChatMessageResult> {
  try {
    const isImage = payload.type === "image";
    const urls = imageUrlListFromPayload(payload);
    const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId)}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        text: payload.text,
        messageType: isImage ? "image" : "text",
        ...(isImage && urls.length === 1 ? { imageUrl: urls[0] } : {}),
        ...(isImage && urls.length > 1 ? { imageUrls: urls } : {}),
      }),
    });
    let data: { ok?: boolean; messageId?: string; error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* ignore */
    }
    if (data.ok && data.messageId) return { ok: true, messageId: data.messageId };
    const msg =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : !res.ok
          ? `전송에 실패했습니다. (${res.status})`
          : "전송에 실패했습니다. 다시 시도해 주세요.";
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "전송에 실패했습니다." };
  }
}

/**
 * 당근형: 채팅 메시지 전송
 * - 항상 API 우선 시도 → DB 저장 보장, 판매자 화면 반영
 */
export async function sendChatMessage(
  roomId: string,
  payload: ChatImageSendPayload
): Promise<SendChatMessageResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const apiResult = await sendMessageViaApi(roomId, user.id, payload);
  if (apiResult.ok) return apiResult;
  if (getTestAuth()) return apiResult;

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "채팅 기능을 사용할 수 없습니다." };

  const sb = supabase as any;

  // 1) 방 조회 및 참여자 확인 (room_status 없을 수 있음 → 스키마 캐시 오류 방지)
  const { data: room, error: roomErr } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
    .eq("id", roomId)
    .single();

  if (roomErr || !room) return { ok: false, error: "채팅방을 찾을 수 없습니다." };
  if (room.seller_id !== user.id && room.buyer_id !== user.id)
    return { ok: false, error: "참여자만 메시지를 보낼 수 있습니다." };
  const status = (room as { room_status?: string }).room_status;
  if (status === "blocked" || status === "report_hold")
    return { ok: false, error: "이 채팅방에서는 메시지를 보낼 수 없습니다." };

  // 2) 차단 확인
  const otherId = room.seller_id === user.id ? room.buyer_id : room.seller_id;
  const { data: blockByMe } = await sb
    .from("user_blocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("blocked_user_id", otherId)
    .maybeSingle();
  const { data: blockByOther } = await sb
    .from("user_blocks")
    .select("id")
    .eq("user_id", otherId)
    .eq("blocked_user_id", user.id)
    .maybeSingle();
  if (blockByMe || blockByOther) return { ok: false, error: "차단 관계에서는 메시지를 보낼 수 없습니다." };

  // 3) 메시지 저장
  const imgUrls = imageUrlListFromPayload(payload);
  const messageType = payload.type === "image" ? "image" : "text";
  if (messageType === "image" && imgUrls.length === 0) {
    return { ok: false, error: "이미지 주소가 필요합니다." };
  }
  const content =
    messageType === "image" ? buildProductChatImageContent(imgUrls, payload.text || "") : payload.text;
  const { data: msg, error: msgErr } = await sb
    .from("product_chat_messages")
    .insert({
      product_chat_id: roomId,
      sender_id: user.id,
      message_type: messageType,
      content,
      image_url: messageType === "image" ? imgUrls[0] ?? null : null,
    })
    .select("id")
    .single();

  if (msgErr) return { ok: false, error: msgErr.message ?? "전송에 실패했습니다." };

  // 4) room last_message_at, preview, unread 갱신 (상대방 unread +1)
  const preview =
    messageType === "image"
      ? payload.text
        ? payload.text.slice(0, 100)
        : imgUrls.length > 1
          ? `사진 ${imgUrls.length}장`
          : "사진"
      : content.slice(0, 100);
  const isSeller = room.seller_id === user.id;
  const updates: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    last_message_preview: preview,
    updated_at: new Date().toISOString(),
  };
  if (isSeller) {
    updates.unread_count_buyer = (room.unread_count_buyer ?? 0) + 1;
  } else {
    updates.unread_count_seller = (room.unread_count_seller ?? 0) + 1;
  }
  await sb.from("product_chats").update(updates).eq("id", roomId);

  // 5) 알림 생성 (상대방)
  await sb.from("notifications").insert({
    user_id: otherId,
    notification_type: "chat",
    title: "새 메시지",
    body: preview,
    link_url: `/chats/${roomId}`,
    is_read: false,
  });

  return { ok: true, messageId: msg?.id ?? "" };
}
