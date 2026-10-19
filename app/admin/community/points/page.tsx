import { Suspense } from "react";
import { AdminCommunityPointsPage } from "@/components/admin/community/points/AdminCommunityPointsPage";

export default function AdminCommunityPointsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityPointsPage />
    </Suspense>
  );
}
