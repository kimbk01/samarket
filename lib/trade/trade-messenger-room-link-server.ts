/**
 * 거래 채팅 링크용 정규 메신저 방 id 해석 (서버 전용 · 조회 전용).
 *
 * 판매·구매 내역·레거시 구매 상세 리다이렉트·상품 상세 「채팅 이어가기」가 `product_chats.id` /
 * `chat_rooms.id` 로 `/community-messenger/rooms/[id]` 를 열면, 방 스냅샷이 URL 을 정규 id 로 바꾸기
 * 전까지 활성 방·알림 표면 id 가 정규 방 id 와 달라 방 안인데도 소리·안 읽음·배너가 날 수 있다.
 * 링크를 처음부터 `community_messenger_rooms.id` 로 만들기 위해 Admin·레거시 판정과 같은 해석기
 * (`resolveTradeMessengerRoomIdsBatch` · `resolveTradeMessengerRoomForAdmin`)만 쓴다.
 * 방 생성·FK 보정 없음. 해석 실패 시 호출부는 기존 경로(레거시 id)를 유지한다.
 *
 * sb 는 service role. 클라이언트에서 import 금지.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyTradeLegacyRoomRefs,
  resolveTradeMessengerRoomForAdmin,
  resolveTradeMessengerRoomIdsBatch,
} from "@/lib/admin-chats/trade-messenger-room";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const tripleKey = (item: string, seller: string, buyer: string): string =>
  item && seller && buyer ? `${item}\u0001${seller}\u0001${buyer}` : "";

/** `product_chats` 행 (판매·구매 내역 SELECT) — `community_messenger_room_id` 포함 */
export type ProductChatRowForMessengerLink = Record<string, unknown>;

/**
 * 판매·구매 내역 행 → `product_chats.id` 별 정규 메신저 방 id.
 * 같은 상품·판매자·구매자 `chat_rooms`(item_trade) 행도 함께 읽어 FK·`trade_item:` 키까지 본다
 * (`resolveTradeMessengerRoomForAdmin` 의 product_chat 분기와 같은 짝 규칙 — 최근 updated_at 1행).
 */
export async function resolveProductChatMessengerRoomIds(
  sb: SupabaseClient<any>,
  rows: readonly ProductChatRowForMessengerLink[]
): Promise<Map<string, string>> {
  const pcRows = rows
    .map((r) => ({
      id: s(r.id),
      item: s(r.post_id),
      seller: s(r.seller_id),
      buyer: s(r.buyer_id),
      fk: s(r.community_messenger_room_id),
    }))
    .filter((r) => r.id);
  if (!pcRows.length) return new Map();

  const items = [...new Set(pcRows.map((r) => r.item).filter(Boolean))];
  const crByTriple = new Map<string, { id: string; fk: string }>();
  for (const chunk of chunkIds(items, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const { data, error } = await sb
      .from("chat_rooms")
      .select("id, item_id, seller_id, buyer_id, community_messenger_room_id")
      .eq("room_type", "item_trade")
      .in("item_id", chunk)
      .order("updated_at", { ascending: false });
    if (error) continue;
    for (const cr of (data ?? []) as Array<Record<string, unknown>>) {
      const key = tripleKey(s(cr.item_id), s(cr.seller_id), s(cr.buyer_id));
      if (!key || crByTriple.has(key)) continue;
      crByTriple.set(key, { id: s(cr.id), fk: s(cr.community_messenger_room_id) });
    }
  }

  return resolveTradeMessengerRoomIdsBatch(
    sb,
    pcRows.map((r) => {
      const cr = crByTriple.get(tripleKey(r.item, r.seller, r.buyer));
      return {
        key: r.id,
        refs: emptyTradeLegacyRoomRefs({
          productChatId: r.id,
          productChatFk: r.fk || null,
          chatRoomId: cr?.id || null,
          chatRoomFk: cr?.fk || null,
          itemId: r.item || null,
          sellerId: r.seller || null,
          buyerId: r.buyer || null,
        }),
      };
    })
  );
}

/**
 * 레거시 거래 채팅 id(`product_chats.id` / `chat_rooms.id`) 하나 → 정규 메신저 방 id.
 * 열람자가 그 거래의 판매자·구매자일 때만 돌려준다 (그 외 null → 호출부가 기존 경로 유지).
 */
export async function resolveLegacyTradeChatMessengerRoomIdForViewer(
  sb: SupabaseClient<any>,
  legacyId: string,
  viewerUserId: string | null | undefined
): Promise<string | null> {
  const viewer = s(viewerUserId);
  const id = s(legacyId);
  if (!viewer || !id) return null;
  const resolved = await resolveTradeMessengerRoomForAdmin(sb, id);
  if (!resolved.messengerRoomId) return null;
  if (resolved.sellerId !== viewer && resolved.buyerId !== viewer) return null;
  return resolved.messengerRoomId;
}
