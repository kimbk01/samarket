import { Suspense } from "react";
import { AdminCommunityStatsPage } from "@/components/admin/community/stats/AdminCommunityStatsPage";

export default function AdminCommunityStatsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityStatsPage />
    </Suspense>
  );
}
