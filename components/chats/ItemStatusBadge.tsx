"use client";

import {
  publicListingBadge,
  type SellerListingState,
  normalizeSellerListingState,
} from "@/lib/products/seller-listing-state";

const TONE_CLASS: Record<"default" | "signature" | "amber" | "muted", string> = {
  default: "border-2 border-current bg-slate-100 text-gray-700",
  signature: "border-2 border-current bg-signature/10 text-signature",
  amber: "border-2 border-current bg-amber-50 text-amber-900",
  muted: "border-2 border-current bg-gray-100 text-gray-600",
};

interface ItemStatusBadgeProps {
  status: string;
  /** posts.seller_listing_state — 있으면 공개 거래 단계 라벨에 사용 */
  sellerListingState?: string | SellerListingState;
}

export function ItemStatusBadge({ status, sellerListingState }: ItemStatusBadgeProps) {
  const ls = normalizeSellerListingState(sellerListingState, status);
  const { label, tone } = publicListingBadge(ls, status);
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}
