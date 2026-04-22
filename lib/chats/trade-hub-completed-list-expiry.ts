/**
 * 거래 채팅 허브 목록(`GET /api/chat/rooms` trade 세그먼트) 전용:
 * 판매 확정(게시글 sold + 해당 방 구매자가 sold_buyer) 이후 일정 시간이 지나면 목록에서만 제외.
 * 개인 판매/구매 내역 API는 이 정책을 적용하지 않는다.
 */

/** 거래 리스트에서 완료 거래를 유지할 시간(밀리초) — 이후 목록에서 제외 */
export const TRADE_HUB_COMPLETED_LIST_GRACE_MS = 6 * 60 * 60 * 1000;

export type TradeHubCompletionTimestamps = {
  sellerCompletedAt: string | null;
  buyerConfirmedAt: string | null;
};

export function tradeHubTripleKey(productId: string, buyerId: string, sellerId: string): string | null {
  const pid = String(productId ?? "").trim();
  const bid = String(buyerId ?? "").trim();
  const sid = String(sellerId ?? "").trim();
  if (!pid || !bid || !sid) return null;
  return `${pid}:${bid}:${sid}`;
}

/** `posts` 행 + 방 구매자 — 승리 구매자 거래방인지 */
export function isWinningSoldTradePost(post: Record<string, unknown> | undefined, roomBuyerId: string): boolean {
  if (!post) return false;
  const status = String(post.status ?? "").trim();
  const soldBuyer = String(post.sold_buyer_id ?? "").trim();
  return status === "sold" && soldBuyer.length > 0 && soldBuyer === String(roomBuyerId ?? "").trim();
}

export function tradeHubListCompletionAnchorMs(times: TradeHubCompletionTimestamps): number | null {
  const a = times.sellerCompletedAt ? Date.parse(times.sellerCompletedAt) : NaN;
  const b = times.buyerConfirmedAt ? Date.parse(times.buyerConfirmedAt) : NaN;
  const vals = [a, b].filter((x) => !Number.isNaN(x));
  if (!vals.length) return null;
  return Math.max(...vals);
}

/**
 * 허브 거래 목록에서 제외할지 — true 이면 응답에서 뺀다.
 * 승리 구매자 완료 거래이면서, 완료 시각(판매자 완료·구매자 확인 중 늦은 쪽) 기준 grace 초과 시만 제외.
 */
function pickLaterIso(a: string | null, b: string | null): string | null {
  if (!b) return a ?? null;
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** 동일 (상품·구매자·판매자) 키로 `product_chats` 완료 시각을 누적(여러 행·보강 조회) */
export function ingestProductChatCompletionRow(
  map: Map<string, TradeHubCompletionTimestamps>,
  row: {
    post_id: string;
    buyer_id: string;
    seller_id: string;
    seller_completed_at?: string | null;
    buyer_confirmed_at?: string | null;
  }
): void {
  const tk = tradeHubTripleKey(row.post_id, row.buyer_id, row.seller_id);
  if (!tk) return;
  const seller = row.seller_completed_at?.trim() || null;
  const buyer = row.buyer_confirmed_at?.trim() || null;
  const prev = map.get(tk) ?? { sellerCompletedAt: null, buyerConfirmedAt: null };
  map.set(tk, {
    sellerCompletedAt: pickLaterIso(prev.sellerCompletedAt, seller),
    buyerConfirmedAt: pickLaterIso(prev.buyerConfirmedAt, buyer),
  });
}

export function shouldOmitTradeRoomFromChatHubList(args: {
  room: {
    generalChat?: unknown;
    productId: string;
    buyerId: string;
    sellerId: string;
  };
  postByProductId: Map<string, Record<string, unknown>>;
  completionByTriple: Map<string, TradeHubCompletionTimestamps>;
  nowMs: number;
  graceMs?: number;
}): boolean {
  const { room, postByProductId, completionByTriple, nowMs } = args;
  const graceMs = args.graceMs ?? TRADE_HUB_COMPLETED_LIST_GRACE_MS;
  if (room.generalChat != null) return false;

  const pid = String(room.productId ?? "").trim();
  if (!pid) return false;

  const post = postByProductId.get(pid);
  if (!isWinningSoldTradePost(post, room.buyerId)) return false;

  const tk = tradeHubTripleKey(room.productId, room.buyerId, room.sellerId);
  if (!tk) return false;

  const times = completionByTriple.get(tk);
  if (!times) return false;

  const anchorMs = tradeHubListCompletionAnchorMs(times);
  if (anchorMs == null || Number.isNaN(anchorMs)) return false;

  return nowMs - anchorMs > graceMs;
}
