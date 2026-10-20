import { Suspense } from "react";
import { AdminReleaseArchivePage } from "@/components/admin/release-archive/AdminReleaseArchivePage";

export default function ReleaseArchivePage() {
  return (
    <Suspense fallback={null}>
      <AdminReleaseArchivePage />
    </Suspense>
  );
}
