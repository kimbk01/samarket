import type { ReactNode } from "react";
import { SuperAdminOnlyPageGate } from "@/components/admin/SuperAdminOnlyPageGate";
import { AdminMockToolNotice } from "@/components/admin/AdminMockToolNotice";

/** V3-08: 내부 운영 도구 — super_admin 전용 (API 는 requireSuperAdmin). 설계 v4 §8: 모의 화면 표기. */
export default function SuperAdminOnlyToolLayout({ children }: { children: ReactNode }) {
  return (
    <SuperAdminOnlyPageGate>
      <AdminMockToolNotice tool="automation" />
      {children}
    </SuperAdminOnlyPageGate>
  );
}
