import { Suspense } from "react";
import { AdminProductionMigrationPage } from "@/components/admin/production-migration/AdminProductionMigrationPage";

export default function ProductionMigrationPage() {
  return (
    <Suspense fallback={null}>
      <AdminProductionMigrationPage />
    </Suspense>
  );
}
