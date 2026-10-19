import { Suspense } from "react";
import { AdminCommunitySupportPage } from "@/components/admin/community/support/AdminCommunitySupportPage";

export default function AdminCommunitySupportRoute() {
  return (
    <Suspense fallback={null}>
      <AdminCommunitySupportPage />
    </Suspense>
  );
}
