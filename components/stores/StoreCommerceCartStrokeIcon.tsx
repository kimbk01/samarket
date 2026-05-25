/** 헤더·스티키바 장바구니 수량 — 빨간 뱃지 · 흰 글씨 (배달 전역 동일) */
export const STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME =
  "pointer-events-none flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--delivery-danger)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[color:var(--delivery-header-bar-bg,#ffffff)]";

/** 히어로 글래스 버튼 위 카트 수량 */
export const STORE_COMMERCE_CART_COUNT_BADGE_ON_HERO_GLASS_CLASSNAME =
  "pointer-events-none absolute -right-1 -top-1 z-[1] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--delivery-danger)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white";

/** primary CTA(녹색 버튼) 위 장바구니 수량 뱃지 */
export const STORE_COMMERCE_CART_COUNT_BADGE_ON_PRIMARY_CLASSNAME =
  "pointer-events-none absolute -right-2 -top-2 z-[1] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--delivery-danger)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[color:var(--delivery-primary)]";

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
