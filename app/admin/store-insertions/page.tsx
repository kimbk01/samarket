import { Suspense } from "react";
import { AdminStoreInsertionControlPage } from "@/components/admin/stores/AdminStoreInsertionControlPage";

export default function AdminStoreInsertionsRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminStoreInsertionControlPage />
    </Suspense>
  );
}
