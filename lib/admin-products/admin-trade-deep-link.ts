/**
 * Admin posts-management → Trade chats / Trade flow deep-link href builders.
 * Query params are navigation hints only (existing Admin auth still gates reads).
 */

export type AdminTradeDeepLinkProduct = {
  id: string;
  sellerId?: string | null;
  reservedBuyerId?: string | null;
  soldBuyerId?: string | null;
  /** Preferred item_trade chat_rooms.id when known */
  tradeChatRoomId?: string | null;
  /** Preferred product_chats.id when known (trade-flow session id) */
  tradeProductChatId?: string | null;
};

function trimId(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

/** Buyer binding for deep-link: sold buyer wins, else reserved. */
export function resolveAdminTradeDeepLinkBuyerId(p: AdminTradeDeepLinkProduct): string {
  return trimId(p.soldBuyerId) || trimId(p.reservedBuyerId);
}

/**
 * /admin/chats/trade?postId=&roomId=&buyerId=&sellerId=
 * roomId preferred when present; postId always required for listing context.
 */
export function buildAdminTradeChatsHref(p: AdminTradeDeepLinkProduct): string {
  const postId = trimId(p.id);
  if (!postId) return "/admin/chats/trade";
  const q = new URLSearchParams();
  q.set("postId", postId);
  const roomId = trimId(p.tradeChatRoomId);
  if (roomId) q.set("roomId", roomId);
  const buyerId = resolveAdminTradeDeepLinkBuyerId(p);
  if (buyerId) q.set("buyerId", buyerId);
  const sellerId = trimId(p.sellerId);
  if (sellerId) q.set("sellerId", sellerId);
  return `/admin/chats/trade?${q.toString()}`;
}

/**
 * /admin/trade-flow?postId=&productChatId=&roomId=
 */
export function buildAdminTradeFlowHref(p: AdminTradeDeepLinkProduct): string {
  const postId = trimId(p.id);
  if (!postId) return "/admin/trade-flow";
  const q = new URLSearchParams();
  q.set("postId", postId);
  const productChatId = trimId(p.tradeProductChatId);
  if (productChatId) q.set("productChatId", productChatId);
  const roomId = trimId(p.tradeChatRoomId);
  if (roomId) q.set("roomId", roomId);
  return `/admin/trade-flow?${q.toString()}`;
}

export type AdminTradeChatDeepLinkQuery = {
  postId: string;
  roomId: string;
  buyerId: string;
  sellerId: string;
};

export function parseAdminTradeChatDeepLink(
  sp: { get(name: string): string | null }
): AdminTradeChatDeepLinkQuery {
  return {
    postId: trimId(sp.get("postId")),
    roomId: trimId(sp.get("roomId")),
    buyerId: trimId(sp.get("buyerId")),
    sellerId: trimId(sp.get("sellerId")),
  };
}

export type AdminTradeFlowDeepLinkQuery = {
  postId: string;
  productChatId: string;
  roomId: string;
};

export function parseAdminTradeFlowDeepLink(
  sp: { get(name: string): string | null }
): AdminTradeFlowDeepLinkQuery {
  return {
    postId: trimId(sp.get("postId")),
    productChatId: trimId(sp.get("productChatId")),
    roomId: trimId(sp.get("roomId")),
  };
}

export function adminTradeChatDeepLinkActive(q: AdminTradeChatDeepLinkQuery): boolean {
  return Boolean(q.postId || q.roomId);
}

export function adminTradeFlowDeepLinkActive(q: AdminTradeFlowDeepLinkQuery): boolean {
  return Boolean(q.postId || q.productChatId || q.roomId);
}

/** Prefer exact roomId, then postId (+ optional buyer/seller). */
export function matchAdminChatRoomToDeepLink<
  T extends { id: string; productId?: string | null; buyerId?: string | null; sellerId?: string | null },
>(rooms: T[], q: AdminTradeChatDeepLinkQuery): T[] {
  if (!adminTradeChatDeepLinkActive(q)) return rooms;
  let list = rooms;
  if (q.roomId) {
    const exact = list.filter((r) => r.id === q.roomId);
    if (exact.length > 0) return exact;
  }
  if (q.postId) {
    list = list.filter((r) => trimId(r.productId) === q.postId);
  }
  if (q.buyerId) {
    list = list.filter((r) => trimId(r.buyerId) === q.buyerId);
  }
  if (q.sellerId) {
    list = list.filter((r) => trimId(r.sellerId) === q.sellerId);
  }
  return list;
}

export function matchAdminTradeFlowSessionToDeepLink<
  T extends { id: string; post_id: string },
>(sessions: T[], q: AdminTradeFlowDeepLinkQuery): T[] {
  if (!adminTradeFlowDeepLinkActive(q)) return sessions;
  let list = sessions;
  if (q.productChatId) {
    const exact = list.filter((s) => s.id === q.productChatId);
    if (exact.length > 0) return exact;
  }
  if (q.postId) {
    list = list.filter((s) => s.post_id === q.postId);
  }
  return list;
}

/** Pick preferred room/product_chat id for a listing given optional bound buyer. */
export function pickPreferredTradeChatIds(args: {
  preferredBuyerId: string;
  chatRooms: Array<{ id: string; buyer_id?: string | null }>;
  productChats: Array<{ id: string; buyer_id?: string | null }>;
}): { tradeChatRoomId: string | null; tradeProductChatId: string | null } {
  const pref = trimId(args.preferredBuyerId);
  const pick = <T extends { id: string; buyer_id?: string | null }>(rows: T[]): string | null => {
    if (!rows.length) return null;
    if (pref) {
      const hit = rows.find((r) => trimId(r.buyer_id) === pref);
      if (hit) return hit.id;
    }
    return rows[0]?.id ?? null;
  };
  return {
    tradeChatRoomId: pick(args.chatRooms),
    tradeProductChatId: pick(args.productChats),
  };
}
