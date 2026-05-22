"use client";

import {
  STORE_COMMERCE_CART_COUNT_BADGE_ON_PRIMARY_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { StoreCommerceBottomActionShell } from "@/components/stores/commerce/StoreCommerceBottomActionShell";
import {
  STORE_COMMERCE_ACTION_CAPTION_CLASS,
  STORE_COMMERCE_ACTION_SHEET_PRICE_CLASS,
  storeCommerceActionBtnClass,
  storeCommerceActionRowClass,
} from "@/lib/stores/store-commerce-bottom-action-bar";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * 옵션 시트 하단 — 좌 이번 메뉴·옵션 합계 / 우 담기(비활성: 옵션·품절·장바구니 불가)
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
  const selectionTotalPhp = Math.max(0, Math.floor(lineTotalPhp) || 0);
  const selectionPriceLabel = formatMoneyPhp(selectionTotalPhp);

  return (
    <StoreCommerceBottomActionShell
      variant="sheet-add"
      inline
      portal={false}
      dataAttribute="data-store-product-sheet-cta"
      errorMessage={errorMessage}
    >
      <div className={storeCommerceActionRowClass("sheet-add")}>
        <div className="min-w-0 flex-1 py-0.5">
          <p className={STORE_COMMERCE_ACTION_SHEET_PRICE_CLASS}>{selectionPriceLabel}</p>
          <p className={`mt-1.5 ${STORE_COMMERCE_ACTION_CAPTION_CLASS}`}>메뉴·옵션 합계</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className={`max-w-[min(100%,13.5rem)] ${storeCommerceActionBtnClass(disabled)}`}
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
    </StoreCommerceBottomActionShell>
  );
}
