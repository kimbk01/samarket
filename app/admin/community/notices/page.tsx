import { Suspense } from "react";
import { AdminCommunityNoticesPage } from "@/components/admin/community/notices/AdminCommunityNoticesPage";

export default function AdminCommunityNoticesRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityNoticesPage />
    </Suspense>
  );
}
