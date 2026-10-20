import { Suspense } from "react";
import { AdminProductBacklogPage } from "@/components/admin/product-backlog/AdminProductBacklogPage";

export default function ProductBacklogPage() {
  return (
    <Suspense fallback={null}>
      <AdminProductBacklogPage />
    </Suspense>
  );
}
