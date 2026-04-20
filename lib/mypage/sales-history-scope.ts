import { normalizePostMeta } from "@/lib/posts/post-normalize";

/** 제목·메타 기준 「구해요/삽니다」형 글 — 판매내역(내가 판 매물)에서 제외 */
export function isBuyingIntentTradePost(post: Record<string, unknown> | undefined): boolean {
  if (!post) return false;
  const title = String(post.title ?? "");
  if (/삽니다/.test(title)) return true;
  const m = post.meta as Record<string, unknown> | undefined;
  const intent = String(m?.trade_intent ?? m?.listing_intent ?? m?.exchange_direction ?? "").toLowerCase();
  if (intent === "buy" || intent === "wtb" || intent === "구매") return true;
  return false;
}

/**
 * 판매내역에 올릴 「내 판매·나눔 글」
 * - 커뮤니티·구매(삽니다) 글 제외
 * - DB에 type 이 trade 외(service/feature/빈 값)로만 들어간 글도 포함 (기존엔 전부 탈락해 목록이 비는 경우가 많음)
 */
export function isSellingPostForSalesHistory(post: Record<string, unknown> | undefined): boolean {
  if (!post) return false;
  if (isBuyingIntentTradePost(post)) return false;
  const t = String(post.type ?? "").toLowerCase();
  if (t === "community") return false;
  // posts.type 없음: 커뮤니티 글은 보통 trade_category_id 가 비어 있거나 board_id 가 있음
  const bid = post.board_id;
  if (bid != null && String(bid).trim()) return false;
  const metaBoard = normalizePostMeta(post.meta)?.board_id;
  if (typeof metaBoard === "string" && metaBoard.trim()) return false;
  const tc = post.trade_category_id ?? post.category_id;
  if (tc == null || !String(tc).trim()) return false;
  return true;
}

export type ItemTradeRoomPair = {
  item_id: string;
  seller_id: string;
  buyer_id: string;
};

/**
 * product_chats 한 줄과 같은 글의 chat_rooms(item_trade) 후보 중 가장 그럴듯한 방 선택
 */
export function pickItemTradeRoomForProductChat(
  postId: string,
  postOwnerId: string,
  pc: { seller_id: string; buyer_id: string },
  rooms: ItemTradeRoomPair[]
): ItemTradeRoomPair | undefined {
  const pid = String(postId);
  const list = rooms.filter((r) => String(r.item_id) === pid);
  const exact = list.find(
    (r) => String(r.seller_id) === String(pc.seller_id) && String(r.buyer_id) === String(pc.buyer_id)
  );
  if (exact) return exact;
  const o = String(postOwnerId);
  return list.find((r) => String(r.seller_id) === o || String(r.buyer_id) === o);
}

/**
 * 판매자(글 작성자) 시점에서 채팅 상대 user id — DB에 buyer/seller 가 뒤집혀 있어도 chat_rooms·작성자 기준으로 보정
 */
export function counterpartyUserIdForSellerView(
  postOwnerId: string,
  pc: { seller_id: string; buyer_id: string },
  room: ItemTradeRoomPair | undefined
): string {
  const o = String(postOwnerId);
  if (room) {
    if (String(room.seller_id) === o) return String(room.buyer_id);
    if (String(room.buyer_id) === o) return String(room.seller_id);
  }
  const s = String(pc.seller_id);
  const b = String(pc.buyer_id);
  if (s === o) return b;
  if (b === o) return s;
  if (s !== b) return s !== o ? s : b;
  return b;
}

/** chat_rooms 한 줄과 product_chats seller/buyer 쌍이 동일 참여자인지(순서 뒤집힘 허용) */
export function sameTradeParticipantPair(
  a: { seller_id: string; buyer_id: string },
  b: { seller_id: string; buyer_id: string }
): boolean {
  const as = String(a.seller_id);
  const ab = String(a.buyer_id);
  const bs = String(b.seller_id);
  const bb = String(b.buyer_id);
  return (as === bs && ab === bb) || (as === bb && ab === bs);
}

/**
 * 구매내역: 내가 chat_rooms 기준 구매자이거나 product_chats.buyer_id 가 나인 행
 */
export function includeProductChatInPurchaseHistory(
  userId: string,
  pc: { post_id: string; seller_id: string; buyer_id: string },
  roomsAsBuyer: ItemTradeRoomPair[]
): boolean {
  if (String(pc.buyer_id) === userId) return true;
  return roomsAsBuyer.some(
    (cr) =>
      String(cr.item_id) === String(pc.post_id) &&
      String(cr.buyer_id) === userId &&
      sameTradeParticipantPair(cr, { seller_id: pc.seller_id, buyer_id: pc.buyer_id })
  );
}
