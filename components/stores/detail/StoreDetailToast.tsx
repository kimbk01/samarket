"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { memo, useLayoutEffect } from "react";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { STORE_COMMERCE_POLICY_TOAST_STORE_ID } from "@/lib/stores/store-detail-toast-ui-store";
import { storeCommerceActionToastBottomCss } from "@/lib/stores/store-commerce-bottom-action-bar";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { DIBAY_TOAST_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

export const StoreDetailToast = memo(function StoreDetailToast({
  storeId,
  message,
}: {
  storeId: string;
  message: string;
}) {
  const policyToast = storeId === STORE_COMMERCE_POLICY_TOAST_STORE_ID;
  const { totalQty } = useStoreCommerceCartBucketStats(
    policyToast ? "" : storeId
  );

  useLayoutEffect(() => {
    deliveryRenderTraceBump("toast-view", { store_id: storeId });
  });

  /** 팝업 SSOT §3-10 (B4) — 겉모양은 공통 토스트, 위치만 매장 하단 담기 바 위 유지 */
  return (
    <DibayToast
      message={message}
      stackClassName={`pointer-events-none fixed inset-x-0 flex justify-center px-4 ${DIBAY_TOAST_Z_CLASS}`}
      stackStyle={{ bottom: storeCommerceActionToastBottomCss(totalQty) }}
    />
  );
});
