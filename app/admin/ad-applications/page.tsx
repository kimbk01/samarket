import { Suspense } from "react";
import { AdminAdApplicationsPage } from "@/components/admin/ads/AdminAdApplicationsPage";

/**
 * /admin/ad-applications — route KEEP; UI ownership in AdminAdApplicationsPage.
 */
export default function AdminAdApplicationsRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminAdApplicationsPage />
    </Suspense>
  );
}
