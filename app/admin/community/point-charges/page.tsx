import { Suspense } from "react";
import { AdminCommunityPointChargesPage } from "@/components/admin/community/charges/AdminCommunityPointChargesPage";

export default function AdminCommunityPointChargesRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunityPointChargesPage />
    </Suspense>
  );
}
