import { Suspense } from "react";
import { AdminAdApplicationsPage } from "@/components/admin/ads/AdminAdApplicationsPage";

/**
 * Community Promotion queue — same writer as ad-applications?domain=community.
 * Renders Domain queue in-place (no redirect-only hollow).
 */
export default function AdminCommunityPromotionsPage() {
  return (
    <Suspense fallback={null}>
      <AdminAdApplicationsPage forcedDomain="community" />
    </Suspense>
  );
}
