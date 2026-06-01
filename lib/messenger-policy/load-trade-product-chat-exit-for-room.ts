import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canSendMessageInRoom,
  type TradeProductChatExitSnapshot,
} from "@/lib/messenger-policy/chat-room-permission";
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";
import { toMessengerPolicyRoomType, type MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

const PRODUCT_CHAT_EXIT_SELECT =
  "id, seller_id, buyer_id, seller_left_at, buyer_left_at, trade_flow_status, chat_mode";

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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
    tradeFlowStatus: r.trade_flow_status != null ? String(r.trade_flow_status) : null,
    chatMode: r.chat_mode != null ? String(r.chat_mode) : null,
  };
}

async function loadProductChatRowByDirectKey(
  sb: SupabaseClient<any>,
  directKey: string
): Promise<unknown> {
  const parsed = parseTradeMessengerDirectKey(directKey);
  if (!parsed) return null;
  if (parsed.kind === "trade_pc") {
    const { data } = await sb
      .from("product_chats")
      .select(PRODUCT_CHAT_EXIT_SELECT)
      .eq("id", parsed.productChatId)
      .maybeSingle();
    return data;
  }
  const { data: chatRoom } = await sb
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id")
    .eq("id", parsed.itemTradeChatRoomId)
    .eq("room_type", "item_trade")
    .maybeSingle();
  if (!chatRoom || typeof chatRoom !== "object") return null;
  const cr = chatRoom as Record<string, unknown>;
  const itemId = trimId(cr.item_id);
  const sellerId = trimId(cr.seller_id);
  const buyerId = trimId(cr.buyer_id);
  if (!itemId || !sellerId || !buyerId) return null;
  const { data } = await sb
    .from("product_chats")
    .select(PRODUCT_CHAT_EXIT_SELECT)
    .eq("post_id", itemId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  return data;
}

export async function loadTradeProductChatExitSnapshotForMessengerRoom(
  sb: SupabaseClient<any>,
  messengerRoomId: string,
  contextMeta: CommunityMessengerRoomContextMetaV1 | null,
  opts?: { directKey?: string | null }
): Promise<TradeProductChatExitSnapshot | null> {
  const rid = messengerRoomId.trim();
  if (!rid) return null;
  /**
   * 메타가 있고 거래가 아니면(`delivery` 등) `product_chats` 조회 생략.
   * `contextMeta === null` 이면 요약 JSON 미박착 방 — `community_messenger_room_id`·direct_key 폴백 유지.
   */
  if (contextMeta != null && contextMeta.kind !== "trade") return null;
  const pcid = contextMeta?.kind === "trade" ? trimId(contextMeta.productChatId) : "";
  if (pcid) {
    const { data } = await sb
      .from("product_chats")
      .select(PRODUCT_CHAT_EXIT_SELECT)
      .eq("id", pcid)
      .maybeSingle();
    const mapped = mapPcRow(data);
    if (mapped) return mapped;
  }
  const { data: byMessengerFk } = await sb
    .from("product_chats")
    .select(PRODUCT_CHAT_EXIT_SELECT)
    .eq("community_messenger_room_id", rid)
    .maybeSingle();
  const mappedByFk = mapPcRow(byMessengerFk);
  if (mappedByFk) return mappedByFk;

  let directKey = trimId(opts?.directKey);
  if (!directKey) {
    const { data: roomRow } = await sb
      .from("community_messenger_rooms")
      .select("direct_key")
      .eq("id", rid)
      .maybeSingle();
    directKey = trimId((roomRow as { direct_key?: unknown } | null)?.direct_key);
  }
  if (!directKey) return null;
  const byDirectKey = await loadProductChatRowByDirectKey(sb, directKey);
  return mapPcRow(byDirectKey);
}

export function evaluateTradeMessagingForMessengerRoom(input: {
  viewerUserId: string;
  roomType: "direct" | "private_group" | "open_group";
  contextMeta: CommunityMessengerRoomContextMetaV1 | null;
  tradeProductChat: TradeProductChatExitSnapshot | null;
}): { canSendMessage: boolean; denyCode: string | null; denyMessage: string | null } {
  let policyType: MessengerPolicyRoomType =
    input.tradeProductChat !== null
      ? "trade"
      : toMessengerPolicyRoomType({
          roomType: input.roomType,
          contextMeta: input.contextMeta,
        });
  /**
   * 거래 메타만 있고 원장 스냅샷이 아직 없으면 UI에서 막지 않는다.
   * 서버 RPC·assert 가 `product_chats` 를 찾으면 동일 가드를 적용한다.
   */
  if (policyType === "trade" && input.tradeProductChat === null) {
    policyType = "direct";
  }
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

/** `product_chats` 연결 거래 스레드가 있으면 나가기·판매자 종료·flow 가드 적용 */
export async function assertMessengerProductChatLinkedSendAllowed(
  sb: SupabaseClient<any>,
  input: { viewerUserId: string; messengerRoomId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rid = input.messengerRoomId.trim();
  if (!rid) return { ok: true };
  const snap = await loadTradeProductChatExitSnapshotForMessengerRoom(sb, rid, null);
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
