import { Suspense } from "react";
import { AdminUserListPage } from "@/components/admin/users/AdminUserListPage";

export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUserListPage />
    </Suspense>
  );
}
