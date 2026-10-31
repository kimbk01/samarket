import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProductChatRowForItemTrade } from "./ensure-product-chat-for-item-trade";

export type ItemTradeRoomRowForSync = {
  item_id?: string | null;
  seller_id?: string | null;
  buyer_id?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

/**
 * 거래 채팅 메시지 1건 전송 후: 레거시 `product_chats` 행의 미리보기·정렬만 맞춤.
 * item_trade 미읽음은 `chat_rooms`/`last_read_message_id` 경로 — 여기서 unread_count_* 를 올리면
 * 목록 병합 시 레거시 숫자가 다시 섞일 수 있어 생략한다.
 */
export async function touchProductChatAfterItemTradeMessage(
  sb: SupabaseClient<any>,
  cr: ItemTradeRoomRowForSync,
  _messageSenderId: string
): Promise<void> {
  const itemId = cr.item_id != null ? String(cr.item_id).trim() : "";
  const sellerId = cr.seller_id != null ? String(cr.seller_id).trim() : "";
  const buyerId = cr.buyer_id != null ? String(cr.buyer_id).trim() : "";
  if (!itemId || !sellerId || !buyerId) return;

  const pc = await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
  if (!pc?.id) return;

  const at = cr.last_message_at != null ? String(cr.last_message_at).trim() : "";
  if (!at) return;

  const preview = (cr.last_message_preview != null ? String(cr.last_message_preview) : "").slice(0, 200);

  await sb
    .from("product_chats")
    .update({
      last_message_at: at,
      last_message_preview: preview,
      updated_at: at,
    })
    .eq("id", pc.id as string);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * item_trade 방 → product_chats 보정 1회 (DB 함수 `reconcile_product_chats_from_item_trade`).
 * 없는 행만 만들고, 마지막 메시지 시각·미리보기(200자)가 다른 행만 고친다 — 값이 같으면 쓰지 않는다.
 * 대상 = role 에 맞는 내 방(seller_id/buyer_id = userId) ∪ postIds 에 달린 방.
 * 이전에는 방마다 조회 1회 + 같은 값 UPDATE 1회를 반복했다 (요청 증폭 근본 수정 3단계 C-1).
 */
export async function reconcileProductChatsFromItemTrade(
  sb: SupabaseClient<any>,
  input: { userId?: string | null; role?: "seller" | "buyer" | null; postIds?: readonly string[] }
): Promise<{ inserted: number; updated: number } | null> {
  const userId = String(input.userId ?? "").trim();
  const role = userId && input.role ? input.role : null;
  const postIds = [...new Set((input.postIds ?? []).map((x) => String(x).trim()).filter((x) => UUID_RE.test(x)))];
  if (!role && !postIds.length) return { inserted: 0, updated: 0 };
  const { data, error } = await sb.rpc("reconcile_product_chats_from_item_trade", {
    p_user_id: role ? userId : null,
    p_role: role,
    p_post_ids: postIds.length ? postIds : null,
  });
  if (error) {
    console.error("[reconcileProductChatsFromItemTrade]", error.message);
    return null;
  }
  const rec = (data ?? {}) as { inserted?: unknown; updated?: unknown };
  return { inserted: Number(rec.inserted) || 0, updated: Number(rec.updated) || 0 };
}
