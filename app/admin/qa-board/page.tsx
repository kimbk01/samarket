import { Suspense } from "react";
import { AdminQaBoardPage } from "@/components/admin/qa-board/AdminQaBoardPage";

export default function QaBoardPage() {
  return (
    <Suspense fallback={null}>
      <AdminQaBoardPage />
    </Suspense>
  );
}
