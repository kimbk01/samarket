import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreProductsPage } from "@/components/admin/stores/AdminStoreProductsPage";

export default function AdminStoreProductsRoute() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminStoreProductsPage />
    </Suspense>
  );
}
