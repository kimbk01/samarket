import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

/** 채팅 상단 4단 — DB `posts.seller_listing_state` 와 동일 키 */
export const TRADE_LISTING_CHAT_STEPS: readonly { state: SellerListingState; label: string }[] = [
  { state: "inquiry", label: "판매중" },
  { state: "negotiating", label: "문의중" },
  { state: "reserved", label: "예약중" },
  { state: "completed", label: "거래완료" },
] as const;

/**
 * 판매자가 `seller-listing-state` API 로 바꿀 수 있는 전이.
 * `거래완료`(글 sold)는 주로 `/seller-complete` 경로 — 여기서는 예약→완료만 허용.
 */
export function canSellerListingTransition(from: SellerListingState, to: SellerListingState): boolean {
  if (from === to) return true;
  if (from === "completed") return false;
  const allowed: [SellerListingState, SellerListingState][] = [
    ["inquiry", "negotiating"],
    ["inquiry", "reserved"],
    ["negotiating", "inquiry"],
    ["negotiating", "reserved"],
    ["reserved", "inquiry"],
    ["reserved", "completed"],
  ];
  return allowed.some(([a, b]) => a === from && b === to);
}

export function isReadOnlyTradeListingViewer(viewerId: string, sellerId: string): boolean {
  return viewerId.trim() !== sellerId.trim();
}

/** 자동 문의중: 판매자 일반 텍스트/이미지 메시지 (시스템·카드 등 제외) */
export function isSellerMessageEligibleForListingInquiryAuto(messageType: string): boolean {
  return messageType === "text" || messageType === "image";
}

export function normalizeListingFromPostRow(row: {
  seller_listing_state?: unknown;
  status?: unknown;
} | null): SellerListingState {
  if (!row) return "inquiry";
  return normalizeSellerListingState(row.seller_listing_state, row.status as string | undefined);
}
