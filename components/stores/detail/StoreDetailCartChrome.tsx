"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { memo, useLayoutEffect } from "react";
import { StoreDetailBottomStrip } from "@/components/stores/StoreDetailBottomStrip";
import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";
import {
  STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { selectStoreProductSheetIsOpen, useStoreProductSheetUIStore } from "@/lib/stores/store-product-sheet-ui-store";
import { openStoreCartPreview } from "@/lib/stores/store-cart-preview-ui-store";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import type { StoreSalesBlockedReason } from "@/lib/stores/store-detail-order-gate";

/** sheet open 은 children(메뉴 subtree) 과 분리 — `StoreProductSheetPortal` 과 동일 격리 축 */
const StoreDetailBottomStripSheetGate = memo(function StoreDetailBottomStripSheetGate({
  storeId,
  slug,
  isOpen,
  deliveryAvailable,
  fulfillmentMode,
  cartTotalPhp,
  cartQtyTotal,
  cartLineKindCount,
  minOrderPhp,
  closedDetail,
  distanceOutOfRange,
  salesBlockedReason,
}: {
  storeId: string;
  slug: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  fulfillmentMode: StorePublicFulfillmentMode;
  cartTotalPhp: number;
  cartQtyTotal: number;
  cartLineKindCount: number;
  minOrderPhp: number | null;
  closedDetail?: string | null;
  distanceOutOfRange?: boolean;
  salesBlockedReason?: StoreSalesBlockedReason | null;
}) {
  const sheetOpen = useStoreProductSheetUIStore(selectStoreProductSheetIsOpen);

  useLayoutEffect(() => {
    deliveryRenderTraceBump("cart-strip", { store_id: storeId });
  });

  if (sheetOpen) return null;

  return (
    <StoreDetailBottomStrip
      slug={slug}
      isOpen={isOpen}
      deliveryAvailable={deliveryAvailable}
      fulfillmentMode={fulfillmentMode}
      cartTotalPhp={cartTotalPhp}
      cartQtyTotal={cartQtyTotal}
      cartLineKindCount={cartLineKindCount}
      minOrderPhp={minOrderPhp}
      closedDetail={closedDetail}
      distanceOutOfRange={distanceOutOfRange}
      salesBlockedReason={salesBlockedReason ?? null}
      onCartPreviewOpen={() => openStoreCartPreview({ storeId, storeSlug: slug })}
    />
  );
});

export const StoreDetailCartChrome = memo(function StoreDetailCartChrome({
  storeId,
  slug,
  isOpen,
  deliveryAvailable,
  fulfillmentMode,
  minOrderPhp,
  closedDetail,
  distanceOutOfRange = false,
  salesBlockedReason = null,
  children,
}: {
  storeId: string;
  slug: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  fulfillmentMode: StorePublicFulfillmentMode;
  minOrderPhp: number | null;
  closedDetail?: string | null;
  distanceOutOfRange?: boolean;
  /** S-02·C-07 — 판매 미승인(샘플 포함) 사유 */
  salesBlockedReason?: StoreSalesBlockedReason | null;
  children: React.ReactNode;
}) {
  const { subtotalPhp, totalQty, itemCount } = useStoreCommerceCartBucketStats(storeId);

  useLayoutEffect(() => {
    deliveryRenderTraceBump("cart-chrome", { store_id: storeId });
  });

  const rootBottomPadClass =
    totalQty > 0
      ? STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS
      : STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS;

  return (
    <div className={rootBottomPadClass}>
      {children}
      <StoreDetailBottomStripSheetGate
        storeId={storeId}
        slug={slug}
        isOpen={isOpen}
        deliveryAvailable={deliveryAvailable}
        fulfillmentMode={fulfillmentMode}
        cartTotalPhp={subtotalPhp}
        cartQtyTotal={totalQty}
        cartLineKindCount={itemCount}
        minOrderPhp={minOrderPhp}
        closedDetail={closedDetail}
        distanceOutOfRange={distanceOutOfRange}
        salesBlockedReason={salesBlockedReason}
      />
    </div>
  );
});
