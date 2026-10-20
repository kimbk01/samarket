import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminPlatformEventOwnerRequestQueueClient } from "@/components/admin/platform-events/AdminPlatformEventOwnerRequestQueueClient";

export default function AdminPlatformEventOwnerRequestsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminPlatformEventOwnerRequestQueueClient />
    </Suspense>
  );
}
