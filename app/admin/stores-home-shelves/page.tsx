import { Suspense } from "react";
import { AdminStoresHomeShelvesPage } from "@/components/admin/stores/AdminStoresHomeShelvesPage";

export default function AdminStoresHomeShelvesRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminStoresHomeShelvesPage />
    </Suspense>
  );
}
