import { Suspense } from "react";
import { AdminNotificationCampaignCreatePage } from "@/components/admin/notifications/AdminNotificationCampaignCreatePage";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-sam-muted">…</div>}>
      <AdminNotificationCampaignCreatePage />
    </Suspense>
  );
}
