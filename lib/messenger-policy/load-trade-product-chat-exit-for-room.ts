import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canSendMessageInRoom,
  type TradeProductChatExitSnapshot,
} from "@/lib/messenger-policy/chat-room-permission";
import { toMessengerPolicyRoomType, type MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function loadTradeProductChatExitSnapshotForMessengerRoom(
  sb: SupabaseClient<any>,
  messengerRoomId: string,
  contextMeta: CommunityMessengerRoomContextMetaV1 | null
): Promise<TradeProductChatExitSnapshot | null> {
  const rid = messengerRoomId.trim();
  if (!rid) return null;
  /**
   * 메타가 있고 거래가 아니면(`delivery` 등) `product_chats` 조회 생략.
   * `contextMeta === null` 이면 요약 JSON 미박착 방 — `community_messenger_room_id` 폴백 유지.
   */
  if (contextMeta != null && contextMeta.kind !== "trade") return null;
  const pcid = contextMeta?.kind === "trade" ? trimId(contextMeta.productChatId) : "";
  if (pcid) {
    const { data } = await sb
      .from("product_chats")
      .select("id, seller_id, buyer_id, seller_left_at, buyer_left_at")
      .eq("id", pcid)
      .maybeSingle();
    const mapped = mapPcRow(data);
    if (mapped) return mapped;
  }
  const { data } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id, seller_left_at, buyer_left_at")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  return mapPcRow(data);
}

function mapPcRow(data: unknown): TradeProductChatExitSnapshot | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  const sellerId = trimId(r.seller_id);
  const buyerId = trimId(r.buyer_id);
  if (!sellerId || !buyerId) return null;
  return {
    sellerId,
    buyerId,
    sellerLeftAt: r.seller_left_at ? String(r.seller_left_at) : null,
    buyerLeftAt: r.buyer_left_at ? String(r.buyer_left_at) : null,
  };
}

export function evaluateTradeMessagingForMessengerRoom(input: {
  viewerUserId: string;
  roomType: "direct" | "private_group" | "open_group";
  contextMeta: CommunityMessengerRoomContextMetaV1 | null;
  tradeProductChat: TradeProductChatExitSnapshot | null;
}): { canSendMessage: boolean; denyCode: string | null; denyMessage: string | null } {
  const policyType: MessengerPolicyRoomType =
    input.tradeProductChat !== null
      ? "trade"
      : toMessengerPolicyRoomType({
          roomType: input.roomType,
          contextMeta: input.contextMeta,
        });
  const gate = canSendMessageInRoom({
    policyType,
    viewerUserId: input.viewerUserId,
    tradeProductChat: input.tradeProductChat,
  });
  if (gate.ok) {
    return { canSendMessage: true, denyCode: null, denyMessage: null };
  }
  return {
    canSendMessage: false,
    denyCode: gate.code ?? "unknown",
    denyMessage: gate.message,
  };
}

/** `product_chats.community_messenger_room_id` 로 연결된 거래 스레드가 있으면 나가기·판매자 종료 규칙 적용 */
export async function assertMessengerProductChatLinkedSendAllowed(
  sb: SupabaseClient<any>,
  input: { viewerUserId: string; messengerRoomId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rid = input.messengerRoomId.trim();
  if (!rid) return { ok: true };
  const { data } = await sb
    .from("product_chats")
    .select("seller_id, buyer_id, seller_left_at, buyer_left_at")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  const snap = mapPcRow(data);
  if (!snap) return { ok: true };
  const gate = canSendMessageInRoom({
    policyType: "trade",
    viewerUserId: input.viewerUserId,
    tradeProductChat: snap,
  });
  if (gate.ok) return { ok: true };
  /** API·클라 `pickMessengerApiErrorField` 가 기계 코드로 매핑할 수 있도록 `message` 대신 `code` 전달 */
  return { ok: false, error: gate.code };
}
