import { Suspense } from "react";
import { AdminNotificationCampaignsPage } from "@/components/admin/notifications/AdminNotificationCampaignsPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-sam-muted">…</div>}>
      <AdminNotificationCampaignsPage />
    </Suspense>
  );
}
