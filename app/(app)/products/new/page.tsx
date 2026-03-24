"use client";

import { useRouter } from "next/navigation";
import { ProductForm } from "@/components/product/form/ProductForm";
import { saveProductTradeFromForm } from "@/lib/products/save-product-from-form";
import { useRegion } from "@/contexts/RegionContext";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function NewProductPage() {
  const router = useRouter();
  const { primaryRegion } = useRegion();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton />
        <h1 className="text-[16px] font-semibold text-gray-900">상품 등록</h1>
        <span className="w-10" />
      </header>
      <ProductForm
        initialValues={{
          region: primaryRegion?.regionId ?? "",
          city: primaryRegion?.cityId ?? "",
          barangay: primaryRegion?.barangay ?? "",
        }}
        saveProduct={saveProductTradeFromForm}
        onSubmitSuccess={(id) => router.push(`/products/${id}`)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
