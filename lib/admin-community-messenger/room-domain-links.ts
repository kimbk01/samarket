/**
 * 채팅 Admin R1 (B) — CM 방 ↔ 도메인(주문·거래) 양방향 링크.
 *
 * 순수 함수 — 클라이언트·서버 공용. DB 조회는 호출부(서버)가 `deriveAdminCmRoomDomainRef` 결과가 부족할 때만 한다.
 * 키 규칙(SSOT):
 * - 주문: `domain_identity_key = store_order:{orderId}` / `direct_key = store_order:{id} | trade_order:{id}`
 * - 거래: `direct_key = trade_item:{chat_rooms.id} | trade_pc:{product_chats.id}`,
 *   `domain_identity_key = trade:{itemId}:{sellerId}:{buyerId}`
 */
import { storeOrderChatEnsureRedirectHref } from "@/lib/chats/surfaces/order-chat-surface";
import { buyerStoreOrderDetailPath } from "@/lib/delivery/customer/navigate-to-buyer-store-order-detail";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

export type AdminCmRoomDomain = "trade" | "store_order" | "general_direct" | "group" | "unknown";

export type AdminCmRoomDomainRef = {
  domain: AdminCmRoomDomain;
  storeOrderId: string | null;
  /** 거래 Admin 상세(`/admin/chats/{id}`)에 쓰는 레거시 id — chat_rooms.id 우선, 없으면 product_chats.id */
  tradeLegacyRoomId: string | null;
  tradePostId: string | null;
};

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function storeOrderIdFromKey(key: string): string | null {
  for (const prefix of ["store_order:", "trade_order:"]) {
    if (key.startsWith(prefix)) {
      const id = key.slice(prefix.length).trim();
      if (id && !id.includes(":")) return id;
    }
  }
  return null;
}

function tradePostIdFromIdentity(key: string): string | null {
  if (!key.startsWith("trade:")) return null;
  const parts = key.split(":");
  return parts.length === 4 && parts[1] ? parts[1] : null;
}

export function deriveAdminCmRoomDomainRef(input: {
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
  directKey?: string | null;
  roomType?: string | null;
}): AdminCmRoomDomainRef {
  const chatDomain = s(input.chatDomain);
  const identity = s(input.domainIdentityKey);
  const directKey = s(input.directKey);
  const storeOrderId = storeOrderIdFromKey(identity) ?? storeOrderIdFromKey(directKey);
  const parsedTrade = parseTradeMessengerDirectKey(directKey);
  const tradeLegacyRoomId = parsedTrade
    ? parsedTrade.kind === "trade_item"
      ? parsedTrade.itemTradeChatRoomId
      : parsedTrade.productChatId
    : null;
  let domain: AdminCmRoomDomain = "unknown";
  if (chatDomain === "trade" || chatDomain === "store_order" || chatDomain === "general_direct" || chatDomain === "group") {
    domain = chatDomain;
  } else if (storeOrderId) {
    domain = "store_order";
  } else if (parsedTrade || identity.startsWith("trade:")) {
    domain = "trade";
  } else if (s(input.roomType) === "private_group" || s(input.roomType) === "open_group") {
    domain = "group";
  }
  return {
    domain,
    storeOrderId: domain === "store_order" ? storeOrderId : null,
    tradeLegacyRoomId: domain === "trade" ? tradeLegacyRoomId : null,
    tradePostId: domain === "trade" ? tradePostIdFromIdentity(identity) : null,
  };
}

/** 통합 CM 관리자 상세 (`/admin/chats/messenger/{roomId}`) — returnTo 유지. */
export function adminCmRoomDetailHref(roomId: string, returnTo?: string | null): string {
  return withAdminReturnTo(`/admin/chats/messenger/${encodeURIComponent(roomId)}`, returnTo);
}

export function adminStoreOrderDetailHref(orderId: string, returnTo?: string | null): string {
  return withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(orderId)}`, returnTo);
}

export function adminStoreOrderChatHref(orderId: string, returnTo?: string | null): string {
  return withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(orderId)}/chat`, returnTo);
}

export function adminTradeChatDetailHref(legacyRoomId: string, returnTo?: string | null): string {
  return withAdminReturnTo(`/admin/chats/${encodeURIComponent(legacyRoomId)}`, returnTo);
}

export function adminTradeFlowHref(postId: string, returnTo?: string | null): string {
  return withAdminReturnTo(`/admin/trade-flow?postId=${encodeURIComponent(postId)}`, returnTo);
}

/**
 * 사용자·사장님 앱 경로 (설계 §3-5 연결 카드) — Admin 은 **열지 않고 복사만** 한다.
 * 사장님 주문 채팅 경로는 방을 생성·입장시키는 route 라 Admin 이 열면 안 된다.
 */
export function adminStoreOrderAppPaths(orderId: string): { owner: string; buyer: string } {
  return { owner: storeOrderChatEnsureRedirectHref(orderId), buyer: buyerStoreOrderDetailPath(orderId) };
}

/** 공개 상품 페이지 (로그인 없이 보이는 화면 — 새 탭으로 열어도 안전). */
export function publicTradePostPath(postId: string): string {
  return SAMARKET_ROUTES.trade.post(postId);
}
