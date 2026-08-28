"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { parseCommerceHubState } from "@/lib/delivery/customer/commerce-hub-nav";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { BuyerDeliveryOrdersBody } from "./BuyerDeliveryOrdersBody";
import { CustomerCouponWalletBody } from "./CustomerCouponWalletBody";
import { CustomerGiftWalletBody } from "./CustomerGiftWalletBody";

function HubPanelFallback() {
  return (
    <div className="flex min-h-[24vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

/** Hub body — no header render; active tab only (G2 single scroll root). */
export function CustomerCommerceHubBody() {
  const searchParams = useSearchParams();
  const state = parseCommerceHubState(searchParams);
  const refresh = searchParams.get("refresh") === "1";

  return (
    <div
      className={APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-customer-commerce-hub-body="1"
      data-commerce-hub-tab={state.tab}
    >
      {state.tab === "orders" ? (
        <Suspense fallback={<HubPanelFallback />}>
          <BuyerDeliveryOrdersBody />
        </Suspense>
      ) : null}
      {state.tab === "coupons" ? (
        <Suspense fallback={<HubPanelFallback />}>
          <CustomerCouponWalletBody couponTab={state.couponTab} refresh={refresh} />
        </Suspense>
      ) : null}
      {state.tab === "gifts" ? (
        <Suspense fallback={<HubPanelFallback />}>
          <CustomerGiftWalletBody giftTab={state.giftTab} from={state.from} refresh={refresh} />
        </Suspense>
      ) : null}
    </div>
  );
}
