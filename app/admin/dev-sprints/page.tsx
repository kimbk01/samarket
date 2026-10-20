import { Suspense } from "react";
import { AdminDevSprintsPage } from "@/components/admin/dev-sprints/AdminDevSprintsPage";

export default function DevSprintsPage() {
  return (
    <Suspense fallback={null}>
      <AdminDevSprintsPage />
    </Suspense>
  );
}
