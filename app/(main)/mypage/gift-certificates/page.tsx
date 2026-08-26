"use client";

import { Suspense } from "react";
import { CustomerGiftCertificateWallet } from "@/components/mypage/CustomerGiftCertificateWallet";

function GiftCertificatesFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

export default function MypageGiftCertificatesPage() {
  return (
    <Suspense fallback={<GiftCertificatesFallback />}>
      <CustomerGiftCertificateWallet />
    </Suspense>
  );
}
