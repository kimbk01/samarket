import { Suspense } from "react";
import { AdminAuditLogsPage } from "@/components/admin/AdminAuditLogsPage";

export default function AdminAuditLogsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminAuditLogsPage />
    </Suspense>
  );
}
