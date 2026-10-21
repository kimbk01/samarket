"use client";

import { useRouter } from "next/navigation";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { ProductForm } from "@/components/product/form/ProductForm";
import { useRegion } from "@/contexts/RegionContext";
import { saveProductTradeFromForm } from "@/lib/products/save-product-from-form";

export default function NewProductPageClient() {
  const router = useRouter();
  const { primaryRegion } = useRegion();

  return (
    <div className="min-h-screen bg-sam-app">
      {/* 헤더 = 전역 1단(`resolve-main-tier1` /products/new) 단독 — 페이지 헤더 중복 제거 */}
      <ProductForm
        initialValues={{
          region: primaryRegion?.regionId ?? "",
          city: primaryRegion?.cityId ?? "",
          /** 대표 주소 City 단위만 — 상세주소(barangay)는 기본값으로 채우지 않는다 (ADDR-SSOT-002) */
          barangay: "",
        }}
        saveProduct={saveProductTradeFromForm}
        onSubmitSuccess={(id) => {
          const href = `/post/${id}`;
          void router.prefetch(href);
          router.push(href);
        }}
        onCancel={() => runHistoryBackWithFallback(router, "/market")}
      />
    </div>
  );
}
