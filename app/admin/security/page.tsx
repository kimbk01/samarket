import { Suspense } from "react";
import { AdminSecurityPage } from "@/components/admin/security/AdminSecurityPage";

export default function SecurityPage() {
  return (
    <Suspense fallback={null}>
      <AdminSecurityPage />
    </Suspense>
  );
}
