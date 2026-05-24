import type { StoreOrderRoomSnapshot } from "@/lib/store-order-chat/use-store-order-room-snapshot";

/**
 * 메신저 배달 주문 방 헤더 — 오너(매장) vs 구매자 표시 분기.
 * 스냅샷 로드 전후로 서로 다른 헤더가 깜빡이지 않도록 단일 규칙.
 */
export type StoreOrderDeliveryHeaderMode =
  | "owner_buyer_peer"
  | "buyer_store"
  | "generic_delivery"
  | "none";

export function resolveStoreOrderDeliveryHeaderMode(input: {
  isDeliveryRoom: boolean;
  myRole: "owner" | "admin" | "member";
  storeOrderSnap: StoreOrderRoomSnapshot | null;
}): StoreOrderDeliveryHeaderMode {
  if (!input.isDeliveryRoom) return "none";
  if (input.storeOrderSnap?.ownerOrder) return "owner_buyer_peer";
  if (input.storeOrderSnap?.buyerOrder) return "buyer_store";
  if (input.myRole === "owner") return "owner_buyer_peer";
  if (input.myRole === "member") return "buyer_store";
  return "generic_delivery";
}

/** store order 방 `title` 은 종종 「매장명 · 상품」 — 주문자 닉네임 폴백으로 쓰지 않음 */
export function buyerNicknameForOwnerHeader(
  peerProfileLabel: string | null | undefined,
  roomTitle: string | null | undefined
): string {
  const fromPeer = peerProfileLabel?.trim();
  if (fromPeer) return fromPeer;
  const title = roomTitle?.trim() ?? "";
  if (title.length > 0 && !title.includes(" · ")) return title;
  return "주문자";
}

const STORE_ORDER_ROOM_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 매장 slug·storeId·room id 가 닉네임/제목으로 노출되는 것 방지 */
export function isStoreTechnicalIdentifier(
  label: string | null | undefined,
  ids?: { storeId?: string | null; storeSlug?: string | null }
): boolean {
  const t = label?.trim() ?? "";
  if (!t) return true;
  if (STORE_ORDER_ROOM_UUID_RE.test(t)) return true;
  const sid = ids?.storeId?.trim().toLowerCase();
  if (sid && t.toLowerCase() === sid) return true;
  const slug = ids?.storeSlug?.trim().toLowerCase();
  if (slug && t.toLowerCase() === slug) return true;
  return false;
}

export function storeNameFromDeliveryHeadline(headline: string | undefined): string | null {
  const h = headline?.trim();
  if (!h) return null;
  const sep = h.indexOf(" · ");
  return sep > 0 ? h.slice(0, sep).trim() || null : h;
}

/** 구매자 헤더·점세개·하단 카드 — 매장명 단일 소스(실 ID·slug 폴백 금지) */
export function resolveDeliveryStoreDisplayName(input: {
  orderCardStoreName?: string | null;
  deliveryHeadline?: string | null;
  roomTitle?: string | null;
  storeId?: string | null;
  storeSlug?: string | null;
}): string {
  const ids = { storeId: input.storeId, storeSlug: input.storeSlug };
  const fromCard = input.orderCardStoreName?.trim();
  if (fromCard && !isStoreTechnicalIdentifier(fromCard, ids)) return fromCard;

  const fromHeadline = storeNameFromDeliveryHeadline(input.deliveryHeadline ?? undefined);
  if (fromHeadline && !isStoreTechnicalIdentifier(fromHeadline, ids)) return fromHeadline;

  const fromTitleHeadline = storeNameFromDeliveryHeadline(input.roomTitle ?? undefined);
  if (fromTitleHeadline && !isStoreTechnicalIdentifier(fromTitleHeadline, ids)) return fromTitleHeadline;

  const title = input.roomTitle?.trim();
  if (title && !isStoreTechnicalIdentifier(title, ids) && title.includes(" · ")) {
    const head = storeNameFromDeliveryHeadline(title);
    if (head && !isStoreTechnicalIdentifier(head, ids)) return head;
  }

  return "매장";
}

/** 하단 주문 카드 1줄 제목 — 매장=주문자, 구매자=매장 */
export function resolveDeliveryChromePrimaryLabel(input: {
  isSeller: boolean;
  storeOrderSnap: StoreOrderRoomSnapshot | null;
  peerProfileLabel: string | null | undefined;
  roomTitle: string;
  deliveryHeadline: string | undefined;
}): string {
  if (input.isSeller) {
    return buyerNicknameForOwnerHeader(input.peerProfileLabel, input.roomTitle);
  }
  return resolveDeliveryStoreDisplayName({
    orderCardStoreName: input.storeOrderSnap?.orderCard?.storeName,
    deliveryHeadline: input.deliveryHeadline,
    roomTitle: input.roomTitle,
    storeSlug: input.storeOrderSnap?.storeSlug,
  });
}

export function resolveDeliveryPeerUserId(input: {
  peerUserId: string;
  viewerUserId: string;
  memberIds: string[];
}): string {
  const peer = input.peerUserId.trim();
  if (peer && peer !== input.viewerUserId.trim()) return peer;
  const viewer = input.viewerUserId.trim();
  for (const id of input.memberIds) {
    const uid = id.trim();
    if (uid && uid !== viewer) return uid;
  }
  return peer;
}
