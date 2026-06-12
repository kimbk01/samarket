import type { StoreOrderRoomSnapshot } from "@/lib/store-order-chat/use-store-order-room-snapshot";
import { getBrowsePrimaryBySlug } from "@/lib/stores/browse-taxonomy-seed-queries";

/** `stores-browse-build` import 금지 — 클라 헤더 훅이 server-only `next/headers` 그래프를 끌어옴 */
function normalizeBizTypeSeparators(raw: string): string {
  return raw
    .trim()
    .replace(/\s*[\u00B7\u2219‧･]\s*/g, " · ")
    .replace(/\s*[-–—|]\s*/g, " · ");
}

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

export type DeliveryStoreIndustryParts = {
  primary: string | null;
  secondary: string | null;
};

/** `business_type` 문자열에 1·2차 구분자가 있는지 */
export function deliveryIndustryHasTwoSegments(businessType: string | null | undefined): boolean {
  const bt = normalizeBizTypeSeparators(businessType ?? "");
  if (!bt) return false;
  return bt.split(" · ").map((s) => s.trim()).filter(Boolean).length >= 2;
}

/** 배달 채팅 헤더 — 1·2차 업종 표시명 분리 */
export function resolveDeliveryStoreIndustryParts(input: {
  storeBusinessType?: string | null;
  storeCategorySlug?: string | null;
  storePrimaryCategoryName?: string | null;
  storeSecondaryCategoryName?: string | null;
}): DeliveryStoreIndustryParts {
  const secondaryFromTopic = input.storeSecondaryCategoryName?.trim() || null;
  const bt = normalizeBizTypeSeparators(input.storeBusinessType ?? "");
  if (bt) {
    const parts = bt.split(" · ").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { primary: parts[0]!, secondary: parts.slice(1).join(" · ") };
    }
    if (parts.length === 1) {
      return { primary: parts[0]!, secondary: secondaryFromTopic };
    }
  }
  const primaryName = input.storePrimaryCategoryName?.trim() || null;
  if (primaryName || secondaryFromTopic) {
    return { primary: primaryName, secondary: secondaryFromTopic };
  }
  const slug = input.storeCategorySlug?.trim();
  if (slug) {
    const primary = getBrowsePrimaryBySlug(slug);
    const primaryKo = primary?.nameKo?.trim() || null;
    if (primaryKo || secondaryFromTopic) {
      return { primary: primaryKo, secondary: secondaryFromTopic };
    }
  }
  return { primary: null, secondary: null };
}

/** 배달 채팅 헤더 subtitle — `business_type` 의 1·2차 업종 (`식당 · 한식`) */
export function resolveDeliveryStoreIndustrySubtitle(input: {
  storeBusinessType?: string | null;
  storeCategorySlug?: string | null;
  storePrimaryCategoryName?: string | null;
  storeSecondaryCategoryName?: string | null;
}): string | null {
  const { primary, secondary } = resolveDeliveryStoreIndustryParts(input);
  if (primary && secondary) return `${primary} · ${secondary}`;
  return primary ?? secondary;
}

/** 배달 구매자 헤더 subtitle — `온라인 - 식당 - 한식` */
export function formatDeliveryMessengerPresenceIndustrySubtitle(input: {
  presenceLine?: string | null;
  industryPrimary?: string | null;
  industrySecondary?: string | null;
}): string | null {
  const segments: string[] = [];
  const presence = input.presenceLine?.trim();
  if (presence) segments.push(presence);
  const primary = input.industryPrimary?.trim();
  if (primary) segments.push(primary);
  const secondary = input.industrySecondary?.trim();
  if (secondary) segments.push(secondary);
  return segments.length > 0 ? segments.join(" - ") : null;
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
