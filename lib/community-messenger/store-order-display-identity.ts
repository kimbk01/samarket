/**
 * 주문채팅(store_order) **표시 정체성 단일 resolver**.
 *
 * 원칙 (Architecture LOCK · 주문채팅 표시 계약):
 * - 방 기준은 orderId(`store_order:{orderId}`), 표시 기준은 매장(storeId + storeName + storeProfileImageUrl).
 * - 표시 정체성의 원천은 오직 `contextMeta`(= `store_orders → stores` enrich 결과) **한 곳**뿐이다.
 * - peer 회원명·username·오너 개인 프로필·`room.title` 일반 direct fallback 을 **절대 쓰지 않는다**.
 * - 매장 정보 누락 시 회원명으로 대체하지 않고 매장 표면(fallback 라벨)을 유지한다.
 *   (`hasResolvedStoreName=false` 로 진단 가능하게 표시)
 *
 * 이 함수는 매장 정보를 "찾아내는" 단일 함수일 뿐, critical/full 마다 서로 다른 원천을 조합하거나
 * 회원 정보로 보정하는 fallback 함수가 아니다.
 */
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomDeliveryDetectSource } from "@/lib/community-messenger/room-context-meta";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

/** 매장 정보 누락 시 표면 라벨 — 회원명 노출 대신 매장 표면 유지 */
export const STORE_ORDER_DISPLAY_STORE_FALLBACK = "매장";

/** GENERAL room.title fallback (`cm_ui_new_conversation`) — 매장 identity로 쓰지 않는다. */
const STORE_ORDER_PLACEHOLDER_TITLES = new Set(["새 대화", "new conversation", "cm_ui_new_conversation"]);

export function isUnusableStoreOrderDisplayName(name: string | null | undefined): boolean {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return true;
  return STORE_ORDER_PLACEHOLDER_TITLES.has(n.toLowerCase());
}

export type StoreOrderDisplayIdentity = {
  storeId: string | null;
  /** 항상 매장 표면. 매장명 미확정 시 fallback 라벨(회원명 아님). */
  storeName: string;
  storeProfileImageUrl: string | null;
  /** 실제 매장명이 확정됐는지 — false 면 fallback 표면(진단용) */
  hasResolvedStoreName: boolean;
};

function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** `{store} · 주문 {no}` 형태 headline 에서 매장명만 추출 (레거시 meta 폴백) */
export function parseStoreNameFromDeliveryHeadline(headline: string | null | undefined): string | null {
  const h = (headline ?? "").trim();
  if (!h) return null;
  const idx = h.indexOf(" · ");
  return idx > 0 ? h.slice(0, idx).trim() || null : h;
}

/**
 * 주문채팅 방의 표시 정체성(매장) 을 resolve 한다.
 * store_order/delivery 방이 아니면 `null` (호출부는 이 경우에만 다른 도메인 렌더로 넘어간다).
 */
export function resolveStoreOrderDisplayIdentity(
  room: CommunityMessengerRoomDeliveryDetectSource
): StoreOrderDisplayIdentity | null {
  const meta = resolveCommunityMessengerDeliveryContextMeta(room);
  if (!meta) return null;

  const rawName = trimOrNull(meta.storeDisplayName) ?? parseStoreNameFromDeliveryHeadline(meta.headline);
  const resolvedName = isUnusableStoreOrderDisplayName(rawName) ? null : rawName;

  const rawImage = trimOrNull(meta.storeProfileImageUrl) ?? trimOrNull(meta.thumbnailUrl);
  const storeProfileImageUrl = rawImage ? resolveStoreProductMediaUrl(rawImage) ?? rawImage : null;

  return {
    storeId: trimOrNull(meta.storeId),
    storeName: resolvedName ?? STORE_ORDER_DISPLAY_STORE_FALLBACK,
    storeProfileImageUrl,
    hasResolvedStoreName: Boolean(resolvedName),
  };
}
