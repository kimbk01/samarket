import { Suspense } from "react";
import { AdminLaunchWeekPage } from "@/components/admin/launch-week/AdminLaunchWeekPage";

export default function LaunchWeekPage() {
  return (
    <Suspense fallback={null}>
      <AdminLaunchWeekPage />
    </Suspense>
  );
}
