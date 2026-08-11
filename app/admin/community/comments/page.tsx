import { Suspense } from "react";
import { AdminCommunityCommentsPage } from "@/components/admin/community/AdminCommunityCommentsPage";

export default function AdminCommunityCommentsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityCommentsPage />
    </Suspense>
  );
}
