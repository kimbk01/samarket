import { Suspense } from "react";
import { AdminOpsKnowledgePage } from "@/components/admin/ops-knowledge/AdminOpsKnowledgePage";

export default function OpsKnowledgePage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsKnowledgePage />
    </Suspense>
  );
}
