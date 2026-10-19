import { Suspense } from "react";
import { AdminCommunityAuditPage } from "@/components/admin/community/audit/AdminCommunityAuditPage";

export default function AdminCommunityAuditRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityAuditPage />
    </Suspense>
  );
}
