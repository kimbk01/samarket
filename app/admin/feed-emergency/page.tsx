import { Suspense } from "react";
import { AdminFeedEmergencyPage } from "@/components/admin/feed-emergency/AdminFeedEmergencyPage";

export default function FeedEmergencyPage() {
  return (
    <Suspense fallback={null}>
      <AdminFeedEmergencyPage />
    </Suspense>
  );
}
