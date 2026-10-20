import { Suspense } from "react";
import { AdminOpsKnowledgeGraphPage } from "@/components/admin/ops-knowledge-graph/AdminOpsKnowledgeGraphPage";

export default function OpsKnowledgeGraphPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsKnowledgeGraphPage />
    </Suspense>
  );
}
