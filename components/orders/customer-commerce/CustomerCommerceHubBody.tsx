"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parseCommerceHubState } from "@/lib/delivery/customer/commerce-hub-nav";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { isMypageSubpageHeaderPath } from "@/lib/mypage/mypage-subpage-header-defaults";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/**
 * 내정보 쿠폰·상품권 지갑(`/mypage/coupons`·`/mypage/gift-certificates`) — 내정보 본문 1열(16/20·640, v3 §2).
 * 배달 주문 허브(`/orders` 등) 는 앱 피드 열 그대로.
 */
const MYPAGE_COMMERCE_HUB_BODY_CLASS = `${MYPAGE_BODY_COLUMN_CLASS} flex min-h-0 flex-1 flex-col gap-1 pt-1`;
import { BuyerDeliveryOrdersBody } from "./BuyerDeliveryOrdersBody";
import { CustomerCouponWalletBody } from "./CustomerCouponWalletBody";
import { CustomerGiftWalletBody } from "./CustomerGiftWalletBody";

function HubPanelFallback() {
  return (
    <div className="flex min-h-[24vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

/** Hub body — single tab IA (no overview duplicate cards). Owner CTA lives in top chrome. */
export function CustomerCommerceHubBody() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const state = parseCommerceHubState(searchParams);
  const refresh = searchParams.get("refresh") === "1";

  return (
    <div
      className={isMypageSubpageHeaderPath(pathname) ? MYPAGE_COMMERCE_HUB_BODY_CLASS : APP_MAIN_TAB_SCROLL_BODY_CLASS}
      data-customer-commerce-hub-body="1"
      data-commerce-hub-tab={state.tab}
      data-commerce-hub-overview="0"
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
