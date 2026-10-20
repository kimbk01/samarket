"use client";

import { useRouter } from "next/navigation";
import { DetailHeader } from "@/components/layout/sector-header";
import { ProductForm } from "@/components/product/form/ProductForm";
import { useRegion } from "@/contexts/RegionContext";
import { saveProductTradeFromForm } from "@/lib/products/save-product-from-form";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function NewProductPageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const { primaryRegion } = useRegion();

  return (
    <div className="min-h-screen bg-sam-app">
      <DetailHeader title={t("trade_072")} onBack={() => router.back()} />
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
        onCancel={() => router.back()}
      />
    </div>
  );
}
