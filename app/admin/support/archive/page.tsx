import { Suspense } from "react";
import { AdminSupportArchivePage } from "@/components/admin/support/AdminSupportArchivePage";

export default function AdminSupportArchiveRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminSupportArchivePage />
    </Suspense>
  );
}
