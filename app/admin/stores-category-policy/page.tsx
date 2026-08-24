import { Suspense } from "react";
import { AdminStoresCategoryPolicyPage } from "@/components/admin/stores/AdminStoresCategoryPolicyPage";

export default function AdminStoresCategoryPolicyRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminStoresCategoryPolicyPage />
    </Suspense>
  );
}
