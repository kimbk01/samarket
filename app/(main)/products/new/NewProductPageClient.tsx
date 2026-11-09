"use client";

import { useRouter } from "next/navigation";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { ProductForm } from "@/components/product/form/ProductForm";
import { saveProductTradeFromForm } from "@/lib/products/save-product-from-form";

export default function NewProductPageClient() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-sam-app">
      {/* 헤더 = 전역 1단(`resolve-main-tier1` /products/new) 단독 — 페이지 헤더 중복 제거 */}
      {/* 거래 지역 = 대표 주소 시/군 — 서버가 정한다(주소 SSOT M5) */}
      <ProductForm
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
