"use client";

import { memo, useLayoutEffect } from "react";
import { useStoreCommerceCartBucketStats } from "@/lib/stores/use-store-commerce-cart-selector";
import { deliveryRenderTraceBump } from "@/lib/dibay/delivery-render-trace";
import { STORE_COMMERCE_POLICY_TOAST_STORE_ID } from "@/lib/stores/store-detail-toast-ui-store";

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
      style={{
        bottom:
          totalQty > 0
            ? "max(96px, calc(env(safe-area-inset-bottom, 0px) + 88px))"
            : "max(88px, calc(env(safe-area-inset-bottom, 0px) + 72px))",
      }}
      role="status"
    >
      {message}
    </div>
  );
});
