import { Suspense } from "react";
import { AdminStaffAccountsPage } from "@/components/admin/staff/AdminStaffAccountsPage";

/** 관리자 계정·권한 (설계 v4 F3) — 최고관리자 전용: 접근표 super_admin + API requireSuperAdmin. */
export default function AdminStaffRoute() {
  return (
    <Suspense fallback={null}>
      <AdminStaffAccountsPage />
    </Suspense>
  );
}
