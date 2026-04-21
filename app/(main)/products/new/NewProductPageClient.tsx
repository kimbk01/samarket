"use client";

import { useRouter } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { ProductForm } from "@/components/product/form/ProductForm";
import { useRegion } from "@/contexts/RegionContext";
import { saveProductTradeFromForm } from "@/lib/products/save-product-from-form";

export default function NewProductPageClient() {
  const router = useRouter();
  const { primaryRegion } = useRegion();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sam-border-soft bg-sam-surface px-4 py-3">
        <AppBackButton />
        <h1 className="sam-text-body-lg font-semibold text-sam-fg">상품 등록</h1>
        <span className="w-10" />
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
