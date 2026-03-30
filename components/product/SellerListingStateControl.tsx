"use client";

import {
  SELLER_LISTING_LABEL,
  type SellerListingState,
  normalizeSellerListingState,
  chatListingBoxClassForState,
} from "@/lib/products/seller-listing-state";

const LISTING_OPTIONS: SellerListingState[] = [
  "inquiry",
  "negotiating",
  "reserved",
  "completed",
];

/** 채팅 상단 카드와 동일 — 직각 박스 + 투명 select 오버레이 + 쉐브론 */
export const SELLER_LISTING_CONTROL_BOX_LAYOUT =
  "relative box-border inline-flex h-[31px] min-h-[31px] w-max max-w-none shrink-0 items-center rounded-md px-1.5 text-[11px] font-bold leading-none shadow-sm";

function ListingChevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

interface SellerListingStateControlProps {
  sellerListingState?: string | undefined;
  postStatus?: string | undefined;
  /** 채팅 낙관적 UI 등 — 있으면 DB 필드 대신 이 값으로 표시·select value */
  forcedValue?: SellerListingState;
  disabled?: boolean;
  /** 값 변경 시 (확인은 상위에서) */
  onChange: (next: SellerListingState) => void;
  className?: string;
}

/**
 * 판매자용 거래 단계 컨트롤 — 채팅 `ChatProductSummary` listingEditable 과 동일 UX
 */
export function SellerListingStateControl({
  sellerListingState,
  postStatus,
  forcedValue,
  disabled,
  onChange,
  className = "",
}: SellerListingStateControlProps) {
  const value =
    forcedValue ??
    normalizeSellerListingState(sellerListingState, postStatus);
  return (
    <div
      className={`${SELLER_LISTING_CONTROL_BOX_LAYOUT} ${chatListingBoxClassForState(value)} ${className}`.trim()}
    >
      <select
        aria-label="거래 상태"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value as SellerListingState);
        }}
        className="absolute inset-0 z-[1] h-full min-h-[31px] w-full min-w-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {LISTING_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {SELLER_LISTING_LABEL[opt]}
          </option>
        ))}
      </select>
      <div className="pointer-events-none flex h-full items-center gap-1 whitespace-nowrap">
        <span className="leading-none">{SELLER_LISTING_LABEL[value]}</span>
        <ListingChevron className="h-3.5 w-3.5 shrink-0 opacity-80" />
      </div>
    </div>
  );
}
