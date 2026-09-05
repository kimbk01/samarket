import { Suspense } from "react";
import { AdminPrelaunchResetPage } from "@/components/admin/prelaunch-reset/AdminPrelaunchResetPage";

export default function AdminPrelaunchResetRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminPrelaunchResetPage />
    </Suspense>
  );
}
