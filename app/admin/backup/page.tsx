import { Suspense } from "react";
import { AdminBackupPage } from "@/components/admin/backup/AdminBackupPage";

export default function BackupPage() {
  return (
    <Suspense fallback={null}>
      <AdminBackupPage />
    </Suspense>
  );
}
