import { Suspense } from "react";
import { AdminPhilifeMeetingEventsClient } from "@/components/admin/community/AdminPhilifeMeetingEventsClient";

export default function AdminPhilifeMeetingEventsPage() {
  return (
    <Suspense fallback={null}>
      <AdminPhilifeMeetingEventsClient />
    </Suspense>
  );
}
