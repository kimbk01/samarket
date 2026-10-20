import { Suspense } from "react";
import { AdminSettingsPage } from "@/components/admin/settings/AdminSettingsPage";

export default function AdminSettingsRoute() {
  return (
    <Suspense fallback={null}>
      <AdminSettingsPage />
    </Suspense>
  );
}
