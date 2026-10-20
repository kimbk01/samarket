"use client";

import { Suspense } from "react";
import { CustomerCommerceHubPage } from "@/components/orders/customer-commerce/CustomerCommerceHubPage";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { CouponWalletCardsSkeleton } from "@/components/orders/customer-commerce/CustomerCouponWalletBody";

/** S44 — 탭 자리 + 쿠폰 카드 3 스켈레톤 ("…" 대체) */
function CouponsFallback() {
  return (
    <div className="mx-auto w-full max-w-[40rem] px-4 pt-3 md:px-5" data-testid="coupons-page-fallback">
      <div className="mb-3 flex gap-4 border-b border-sam-border-soft pb-2">
        {[0, 1].map((i) => (
          <span key={i} className="h-4 w-16 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
        ))}
      </div>
      <CouponWalletCardsSkeleton />
    </div>
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
