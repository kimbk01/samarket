import { Suspense } from "react";
import { AdminCommunityEngineMeetingsClient } from "@/components/admin/community/AdminCommunityEngineMeetingsClient";

export default function AdminCommunityMeetingsEnginePage() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityEngineMeetingsClient />
    </Suspense>
  );
}
