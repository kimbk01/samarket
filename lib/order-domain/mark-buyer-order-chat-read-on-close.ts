/**
 * 주문이 끝나면(완료·취소·환불) 고객 쪽 주문 채팅 안 읽음과 그 주문 알림을 읽음으로 바꾼다.
 *
 * Owner 2026-11-10 「알림도 읽음 처리」: 끝난 주문 방에 안 읽음 숫자가 영구히 남던 결함(운영 821방 중 336방)의 원인 수정.
 * - 읽음 경로는 고객이 방을 열 때와 같은 `readOrderChat`(dibay_mark_room_read_atomic 단일 트랜잭션)만 쓴다.
 *   이 경로는 채팅 안 읽음과 함께 그 주문의 `buyer_order` 알림·방 메시지 알림도 읽음으로 바꾼다
 *   → N-09 「주문당 미읽음 알림 1건 유지」 를 끝난 주문에 한해 Owner 지시로 대체한다.
 * - 진행 중 상태 안내는 지금처럼 안 읽음으로 남긴다.
 * - 고객이 이미 나간 방(참여 행 없음·left_at)은 건드리지 않는다.
 * - 상태 전환 응답을 막지 않도록 실패는 기록만 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isStoreOrderBuyerHideAllowedStatus } from "@/lib/stores/store-order-process-model";
import { readOrderChat } from "@/lib/order-domain/read-order-chat";

export type MarkBuyerOrderChatReadOnCloseResult =
  | { ok: true; skipped: false; participantUnreadAfter: number }
  | { ok: true; skipped: true; reason: "not_closed" | "no_room" | "buyer_not_in_room" }
  | { ok: false; error: string };

export async function markBuyerOrderChatReadOnOrderClosed(
  sb: SupabaseClient,
  input: { orderId: string; buyerUserId: string; nextStatus: string }
): Promise<MarkBuyerOrderChatReadOnCloseResult> {
  const orderId = input.orderId.trim();
  const buyerUserId = input.buyerUserId.trim();
  if (!isStoreOrderBuyerHideAllowedStatus(input.nextStatus)) {
    return { ok: true, skipped: true, reason: "not_closed" };
  }
  if (!orderId || !buyerUserId) return { ok: true, skipped: true, reason: "no_room" };

  const { data: orderRow, error: orderErr } = await sb
    .from("store_orders")
    .select("community_messenger_room_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return { ok: false, error: orderErr.message };
  const roomId = String(
    (orderRow as { community_messenger_room_id?: unknown } | null)?.community_messenger_room_id ?? ""
  ).trim();
  if (!roomId) return { ok: true, skipped: true, reason: "no_room" };

  const { data: part, error: partErr } = await sb
    .from("community_messenger_participants")
    .select("left_at")
    .eq("room_id", roomId)
    .eq("user_id", buyerUserId)
    .maybeSingle();
  if (partErr) return { ok: false, error: partErr.message };
  if (!part || (part as { left_at?: unknown }).left_at) {
    return { ok: true, skipped: true, reason: "buyer_not_in_room" };
  }

  const read = await readOrderChat(sb, { userId: buyerUserId, orderId, roomId, role: "customer" });
  if (!read.ok) return { ok: false, error: read.error };
  return { ok: true, skipped: false, participantUnreadAfter: read.participantUnreadAfter };
}
