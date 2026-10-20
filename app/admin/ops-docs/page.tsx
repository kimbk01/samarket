import { Suspense } from "react";
import { AdminOpsDocsPage } from "@/components/admin/ops-docs/AdminOpsDocsPage";

export default function OpsDocsPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsDocsPage />
    </Suspense>
  );
}
