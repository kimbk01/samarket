"use client";

import { Suspense } from "react";
import { CustomerCommerceHubPage } from "@/components/orders/customer-commerce/CustomerCommerceHubPage";

function GiftCertificatesFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

export default function MypageGiftCertificatesPage() {
  return (
    <Suspense fallback={<GiftCertificatesFallback />}>
      <CustomerCommerceHubPage legacyAlias="gifts" />
    </Suspense>
  );
}
