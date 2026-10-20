import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminPromotionBannerListClient } from "@/components/admin/platform-promotion/AdminPromotionBannerListClient";

export default function AdminPromotionBannersPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminPromotionBannerListClient />
    </Suspense>
  );
}
