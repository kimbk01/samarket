"use client";

import { Suspense } from "react";
import { CustomerStoreCouponWallet } from "@/components/mypage/CustomerStoreCouponWallet";

function CouponsFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

export default function MypageCouponsPage() {
  return (
    <Suspense fallback={<CouponsFallback />}>
      <CustomerStoreCouponWallet />
    </Suspense>
  );
}
