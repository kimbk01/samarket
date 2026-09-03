import { Suspense } from "react";
import { AdminPlatformPopupHubPage } from "@/components/admin/platform-popup/AdminPlatformPopupHubPage";

export default function AdminPlatformPopupPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminPlatformPopupHubPage />
    </Suspense>
  );
}
