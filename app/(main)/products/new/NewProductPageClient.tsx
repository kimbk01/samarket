"use client";

import { useRouter } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { ProductForm } from "@/components/product/form/ProductForm";
import { useRegion } from "@/contexts/RegionContext";
import { saveProductTradeFromForm } from "@/lib/products/save-product-from-form";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

export default function NewProductPageClient() {
  const router = useRouter();
  const { primaryRegion } = useRegion();

  return (
    <div className="min-h-screen bg-sam-app">
      <header className="sticky top-0 z-10 border-b border-sam-border-soft bg-sam-surface">
        <div className={`${APP_MAIN_HEADER_INNER_CLASS} flex items-center justify-between py-3`}>
          <AppBackButton />
          <h1 className="sam-text-body-lg font-semibold text-sam-fg">상품 등록</h1>
          <span className="w-10" />
        </div>
      </header>
      <ProductForm
        initialValues={{
          region: primaryRegion?.regionId ?? "",
          city: primaryRegion?.cityId ?? "",
          barangay: primaryRegion?.barangay ?? "",
        }}
        saveProduct={saveProductTradeFromForm}
        onSubmitSuccess={(id) => {
          const href = `/products/${id}`;
          void router.prefetch(href);
          router.push(href);
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}
