import { Suspense } from "react";
import { AdminOpsBoardPage } from "@/components/admin/ops-board/AdminOpsBoardPage";

export default function OpsBoardPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsBoardPage />
    </Suspense>
  );
}
