/**
 * WP-6 / CHAT-02 — 모든 전송 경로 공통 송신 허용 가드.
 *
 * 과거: 차단·거래 가드가 텍스트 전송에만 있고 이미지·파일·음성·스티커·게시글 공유에는
 * 빠져 있었다(주문 종료 잠금도 텍스트/타입 RPC 에만). 6개 전송 경로가 모두 이 함수를
 * 호출해 동일 순서로 검사한다: 참여 → 방 상태(archived 포함) → 차단 → 거래 상태 → 주문 종료.
 *
 * 업로드가 있는 route 는 **업로드 전에** 호출한다(고아 파일 방지에도 기여).
 * DB RPC(text/append)도 동일 가드를 갖지만, 이 함수는 조기·일관 거부와 업로드 전 차단을 담당한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertActiveGroupMembershipIfGroup } from "@/lib/community-messenger/group/group-active-membership-gate";
import { assertDirectRoomCommunicationNotBlocked } from "@/lib/community-messenger/direct-room-communication-gate";

export type MessengerSendGuardError =
  | "room_not_found"
  | "room_deleted"
  | "room_blocked"
  | "room_archived"
  | "room_readonly"
  | "forbidden"
  | "blocked_target"
  | "trade_chat_mode_locked"
  | "trade_flow_not_chatting"
  | "trade_sender_left"
  | "trade_seller_closed"
  | "store_order_chat_closed";

export type MessengerSendGuardResult =
  | { ok: true; roomType: string | null }
  | { ok: false; error: MessengerSendGuardError };

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 단일 전송 허용 판정. 서비스 롤 supabase 클라이언트를 받는다.
 */
export async function assertMessengerRoomSendAllowed(input: {
  supabase: SupabaseClient<any>;
  userId: string;
  roomId: string;
}): Promise<MessengerSendGuardResult> {
  const sb = input.supabase;
  const userId = s(input.userId);
  const roomId = s(input.roomId);
  if (!userId || !roomId) return { ok: false, error: "room_not_found" };

  // 1) 참여 여부 + 방 상태 + 거래/주문 메타를 한 번에 로드
  const [{ data: roomRow }, { data: partRow }, { data: pcRow }, { data: orderRow }] = await Promise.all([
    sb
      .from("community_messenger_rooms")
      .select("id, room_type, room_status, is_readonly, deleted_at")
      .eq("id", roomId)
      .maybeSingle(),
    sb
      .from("community_messenger_participants")
      .select("left_at")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("product_chats")
      .select("seller_id, buyer_id, seller_left_at, buyer_left_at, trade_flow_status, chat_mode")
      .eq("community_messenger_room_id", roomId)
      .limit(1)
      .maybeSingle(),
    sb
      .from("store_orders")
      .select("order_status")
      .eq("community_messenger_room_id", roomId)
      .in("order_status", ["completed", "cancelled", "COMPLETED", "CANCELLED", "Completed", "Cancelled"])
      .limit(1)
      .maybeSingle(),
  ]);

  if (!roomRow) return { ok: false, error: "room_not_found" };
  const roomType = s((roomRow as { room_type?: unknown }).room_type) || null;

  // 2) 방 상태 (deleted → blocked → archived → readonly)
  if (s((roomRow as { deleted_at?: unknown }).deleted_at)) return { ok: false, error: "room_deleted" };
  const roomStatus = s((roomRow as { room_status?: unknown }).room_status).toLowerCase();
  if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (roomStatus === "archived") return { ok: false, error: "room_archived" };
  if ((roomRow as { is_readonly?: unknown }).is_readonly === true) return { ok: false, error: "room_readonly" };

  // 그룹: 활성 멤버십(ban 포함) / 비그룹: 참여 행 존재
  const isGroup = roomType === "private_group" || roomType === "open_group";
  if (isGroup) {
    const g = await assertActiveGroupMembershipIfGroup({ userId, roomId, supabase: sb, roomType });
    if (!g.ok) return { ok: false, error: g.error === "user_banned" ? "forbidden" : "room_not_found" };
  } else {
    if (!partRow) return { ok: false, error: "room_not_found" };
    if (s((partRow as { left_at?: unknown }).left_at)) return { ok: false, error: "forbidden" };
  }

  // 3) 차단 (1:1)
  if (!isGroup) {
    const blk = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: userId, roomId, supabase: sb });
    if (!blk.ok) return { ok: false, error: "blocked_target" };
  }

  // 4) 거래 상태 (product_chats)
  if (pcRow) {
    const sellerId = s((pcRow as { seller_id?: unknown }).seller_id);
    const buyerId = s((pcRow as { buyer_id?: unknown }).buyer_id);
    const sellerLeft = s((pcRow as { seller_left_at?: unknown }).seller_left_at);
    const buyerLeft = s((pcRow as { buyer_left_at?: unknown }).buyer_left_at);
    const flow = (s((pcRow as { trade_flow_status?: unknown }).trade_flow_status) || "chatting").toLowerCase();
    const mode = (s((pcRow as { chat_mode?: unknown }).chat_mode) || "open").toLowerCase();
    if (sellerId) {
      if (mode === "limited" || mode === "readonly") return { ok: false, error: "trade_chat_mode_locked" };
      if (flow !== "chatting") return { ok: false, error: "trade_flow_not_chatting" };
      if (userId === sellerId && sellerLeft) return { ok: false, error: "trade_sender_left" };
      if (userId === buyerId && buyerLeft) return { ok: false, error: "trade_sender_left" };
      if (userId === buyerId && sellerLeft) return { ok: false, error: "trade_seller_closed" };
    }
  }

  // 5) 주문 종료 (completed/cancelled store_order)
  if (orderRow) return { ok: false, error: "store_order_chat_closed" };

  return { ok: true, roomType };
}
