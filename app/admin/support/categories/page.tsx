import { Suspense } from "react";
import { AdminSupportCategoriesPage } from "@/components/admin/support/AdminSupportCategoriesPage";

export default function AdminSupportCategoriesRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminSupportCategoriesPage />
    </Suspense>
  );
}
