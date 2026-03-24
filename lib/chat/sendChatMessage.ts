"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTestAuth } from "@/lib/auth/test-auth-store";

export type SendChatMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** 메시지 타입 */
export type MessagePayloadType = "text" | "image";

/** 테스트 로그인 시 서버 API로 전송 (RLS 우회) */
async function sendMessageViaApi(
  roomId: string,
  _userId: string,
  payload: { type: MessagePayloadType; text: string; imageUrl?: string }
): Promise<SendChatMessageResult> {
  try {
    const isImage = payload.type === "image";
    const res = await fetch(`/api/chat/room/${roomId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: payload.text,
        messageType: isImage ? "image" : "text",
        ...(isImage && payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
      }),
    });
    const data = await res.json();
    if (data.ok && data.messageId) return { ok: true, messageId: data.messageId };
    return { ok: false, error: data.error ?? "전송에 실패했습니다." };
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
  payload: { type: MessagePayloadType; text: string; imageUrl?: string }
): Promise<SendChatMessageResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const text = payload.type === "image" && payload.imageUrl ? payload.text || "" : payload.text;
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
  const content = payload.type === "image" && payload.imageUrl ? payload.text || "" : payload.text;
  const messageType = payload.type === "image" ? "image" : "text";
  const { data: msg, error: msgErr } = await sb
    .from("product_chat_messages")
    .insert({
      product_chat_id: roomId,
      sender_id: user.id,
      message_type: messageType,
      content,
      image_url: payload.imageUrl ?? null,
    })
    .select("id")
    .single();

  if (msgErr) return { ok: false, error: msgErr.message ?? "전송에 실패했습니다." };

  // 4) room last_message_at, preview, unread 갱신 (상대방 unread +1)
  const preview = content.slice(0, 100);
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
