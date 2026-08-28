"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { parseCommerceHubState } from "@/lib/delivery/customer/commerce-hub-nav";
import { parseStoreOrdersHubFilter } from "@/lib/delivery/customer/store-orders-hub-filter";

/** Orders tab body — no portal header; RegionBar is canonical. */
export function BuyerDeliveryOrdersBody() {
  const searchParams = useSearchParams();
  const state = parseCommerceHubState(searchParams);
  const expandOrderId = state.expand;
  const orderFilter = parseStoreOrdersHubFilter(state.orderFilter);

  return (
    <div className="min-w-0 flex-1" data-commerce-hub-orders-body="1" data-order-filter={orderFilter}>
      <Suspense
        fallback={
          <div className="flex min-h-[24vh] items-center justify-center text-sm text-sam-muted">…</div>
        }
      >
        <MyStoreOrdersView
          variant="deliveryHub"
          suppressTier1Sync
          embedded
          initialExpandOrderId={expandOrderId}
          hubOrderFilter={orderFilter}
        />
      </Suspense>
    </div>
  );
}
