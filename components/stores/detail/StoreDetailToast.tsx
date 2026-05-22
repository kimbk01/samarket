"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { memo, useLayoutEffect } from "react";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { STORE_COMMERCE_POLICY_TOAST_STORE_ID } from "@/lib/stores/store-detail-toast-ui-store";
import { storeCommerceActionToastBottomCss } from "@/lib/stores/store-commerce-bottom-action-bar";

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

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[90] max-w-[min(92vw,20rem)] -translate-x-1/2 rounded-[12px] bg-neutral-900/92 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg"
      style={{ bottom: storeCommerceActionToastBottomCss(totalQty) }}
      role="status"
    >
      {message}
    </div>
  );
});
