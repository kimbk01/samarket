import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminPtrRevealListPage } from "@/components/admin/ptr-reveal/AdminPtrRevealListPage";

/** Platform Promotion — 당겨서 새로고침 띠 광고 (Platform Popup `ptr_reveal` 캠페인) */
export default function AdminPtrRevealAdsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminPtrRevealListPage />
    </Suspense>
  );
}
