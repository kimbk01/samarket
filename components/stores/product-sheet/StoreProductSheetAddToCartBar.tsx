"use client";

import {
  STORE_COMMERCE_CART_COUNT_BADGE_ON_PRIMARY_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * 옵션 시트 하단 — 좌=이번 메뉴·옵션 합계 · 우=카트 담기(컴팩트·우측) · 아이콘 수량 뱃지
 */
export function StoreProductSheetAddToCartBar({
  storeId,
  lineTotalPhp,
  label,
  disabled,
  errorMessage,
  onAdd,
}: {
  storeId: string | null;
  lineTotalPhp: number;
  label: string;
  disabled: boolean;
  errorMessage?: string | null;
  onAdd: () => void;
}) {
  const { totalQty: cartQtyTotal, hydrated: cartHydrated } = useStoreCommerceCartBucketStats(storeId);

  const badgeQty = cartHydrated && cartQtyTotal > 0 ? cartQtyTotal : 0;
  /** 좌측 금액: 담기 전 — 지금 고르는 메뉴·옵션·수량만 (기존 카트 합산 없음) */
  const selectionTotalPhp = Math.max(0, Math.floor(lineTotalPhp) || 0);
  const selectionPriceLabel = formatMoneyPhp(selectionTotalPhp);

  return (
    <div
      className="delivery-ui shrink-0 border-t border-[var(--delivery-border-section)] bg-[#f2f4f6] px-4 pb-3 pt-3.5"
      style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom, 0px))" }}
      data-store-product-sheet-cta="1"
    >
      {errorMessage ? (
        <p className="mb-2.5 text-center text-[11px] font-medium text-red-600">{errorMessage}</p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-[20px] font-extrabold leading-none tabular-nums tracking-tight text-[#111111]">
            {selectionPriceLabel}
          </p>
          <p className="mt-1.5 text-[11px] font-medium leading-none text-[#888888]">메뉴·옵션 합계</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className={`ml-auto flex min-h-[50px] w-auto max-w-[min(100%,13.5rem)] shrink-0 items-center justify-center gap-2 rounded-xl border-0 bg-[#2386b1] px-4 text-[15px] font-bold leading-tight text-white shadow-[0_2px_10px_rgba(35,134,177,0.32)] transition-[background-color,transform] duration-150 hover:bg-[#1f789f] active:scale-[0.98] active:bg-[#1a6a8f] disabled:cursor-not-allowed disabled:bg-[#b8b8b8] disabled:shadow-none ${STORE_ORDER_TOUCH_BTN}`}
          aria-label={
            badgeQty > 0
              ? `${label}, 카트 ${badgeQty}개, 메뉴·옵션 합계 ${selectionPriceLabel}`
              : `${label}, 메뉴·옵션 합계 ${selectionPriceLabel}`
          }
        >
          <span className="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
            <StoreCommerceCartStrokeIcon className="h-[19px] w-[19px] text-white" />
            {badgeQty > 0 ? (
              <span
                className={STORE_COMMERCE_CART_COUNT_BADGE_ON_PRIMARY_CLASSNAME}
                aria-hidden
              >
                {badgeQty > 99 ? "99+" : badgeQty}
              </span>
            ) : null}
          </span>
          <span className="truncate">{label}</span>
        </button>
      </div>
    </div>
  );
}
