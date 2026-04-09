"use client";

import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import { StoreReportForm } from "@/components/stores/StoreReportForm";

export function StoreReportPageClient({
  slug,
  productId,
}: {
  slug: string;
  productId?: string;
}) {
  const safeSlug = typeof slug === "string" ? slug : "";
  const mode = productId ? "product" : "store";

  if (!safeSlug) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] p-4">
        <p className="text-sm text-gray-600">잘못된 주소입니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="truncate text-center text-[16px] font-semibold text-gray-900">
          {mode === "product" ? "상품 신고" : "매장 신고"}
        </h1>
      </header>
      <div className="mx-4 mt-4 rounded-ui-rect border border-gray-100 bg-white p-4 shadow-sm">
        <StoreReportForm storeSlug={safeSlug} mode={mode} productId={productId} />
      </div>
    </div>
  );
}
