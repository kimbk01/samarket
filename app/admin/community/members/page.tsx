import { Suspense } from "react";
import { AdminCommunityMembersPage } from "@/components/admin/community/members/AdminCommunityMembersPage";

export default function AdminCommunityMembersRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityMembersPage />
    </Suspense>
  );
}
