"use client";

import { Suspense } from "react";
import { CustomerCommerceHubPage } from "@/components/orders/customer-commerce/CustomerCommerceHubPage";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext } from "@/lib/support/support-context";

function CouponsFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

export default function MypageCouponsPage() {
  return (
    <SupportContextProvider
      value={buildMemberSupportContext({
        enabled: true,
        category: "COUPON",
        sourceSurface: "mypage_coupons",
      })}
    >
      <Suspense fallback={<CouponsFallback />}>
        <CustomerCommerceHubPage legacyAlias="coupons" />
      </Suspense>
    </SupportContextProvider>
  );
}
