import { Suspense } from "react";
import { AdminReleaseNotesPage } from "@/components/admin/release-notes/AdminReleaseNotesPage";

export default function ReleaseNotesPage() {
  return (
    <Suspense fallback={null}>
      <AdminReleaseNotesPage />
    </Suspense>
  );
}
