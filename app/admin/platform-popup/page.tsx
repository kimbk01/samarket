import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminPlatformPopupListPage } from "@/components/admin/platform-popup/AdminPlatformPopupListPage";

/** Platform Promotion — Popup hub (canonical campaign list; not Paid Ads ops). */
export default function AdminPlatformPopupPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminPlatformPopupListPage />
    </Suspense>
  );
}
