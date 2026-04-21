/** 헤더·스티키바 등 장바구니 숫자 뱃지 공통 (브랜드 시그니처) */
export const STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME =
  "pointer-events-none flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-signature px-1 sam-text-xxs font-bold leading-none text-white";

/** 매장 상단·하단 장바구니 링크 공통 아이콘 (stroke, currentColor) */
export function StoreCommerceCartStrokeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
