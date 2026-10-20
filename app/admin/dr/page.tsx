import { Suspense } from "react";
import { AdminDrPage } from "@/components/admin/dr/AdminDrPage";

export default function DrPage() {
  return (
    <Suspense fallback={null}>
      <AdminDrPage />
    </Suspense>
  );
}
