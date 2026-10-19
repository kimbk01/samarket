/**
 * 채팅 Admin R1 (B · C-18) — 공개 `POST /api/community-messenger/rooms` 의 `storeOrderId` 분기 어댑터.
 *
 * 레거시 `ensureCommunityMessengerDirectRoomFromStoreOrderChat` 대신 정식 `ensureStoreOrderMessengerRoom`
 * (domain_identity_key `store_order:{id}` · 참가자 store_order_role · 주문 요약)에 위임하고,
 * 응답은 레거시 모양 `{ ok, roomId, peerUserId, error }` 와 에러 코드를 그대로 유지한다.
 * 서버 전용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureStoreOrderMessengerRoom } from "@/lib/community-messenger/store-order-chat-service";

export type LegacyStoreOrderRoomsPostResult = {
  ok: boolean;
  roomId?: string;
  peerUserId?: string;
  error?: string;
};

/** 정식 ensure 에러 → 레거시 응답 에러 코드 (라우트의 HTTP 상태 매핑 유지). */
export function mapCanonicalStoreOrderEnsureError(error: string): string {
  switch (error) {
    case "forbidden":
      return "not_participant";
    case "order_not_found":
      return "store_order_not_found";
    case "missing_order_id":
      return "bad_order";
    case "participants_missing":
      return "order_chat_invalid";
    default:
      return error || "room_failed";
  }
}

export async function ensureStoreOrderRoomForLegacyRoomsPost(
  sb: SupabaseClient<any>,
  userId: string,
  storeOrderId: string
): Promise<LegacyStoreOrderRoomsPostResult> {
  const oid = storeOrderId.trim();
  const uid = userId.trim();
  if (!oid) return { ok: false, error: "bad_order" };
  if (!uid) return { ok: false, error: "not_participant" };
  const ensured = await ensureStoreOrderMessengerRoom(sb, { orderId: oid, userId: uid });
  if (!ensured.ok) return { ok: false, error: mapCanonicalStoreOrderEnsureError(ensured.error) };
  const peerUserId = uid === ensured.buyerUserId ? ensured.ownerUserId : ensured.buyerUserId;
  return { ok: true, roomId: ensured.roomId, peerUserId };
}
