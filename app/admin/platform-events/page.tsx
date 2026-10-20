import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminPlatformEventsListClient } from "@/components/admin/platform-events/AdminPlatformEventsListClient";

export default function AdminPlatformEventsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminPlatformEventsListClient />
    </Suspense>
  );
}
