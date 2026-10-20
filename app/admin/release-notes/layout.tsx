import type { ReactNode } from "react";
import { SuperAdminOnlyPageGate } from "@/components/admin/SuperAdminOnlyPageGate";

/** V3-08: 내부 운영 도구 — super_admin 전용 (API 는 requireSuperAdmin). */
export default function SuperAdminOnlyToolLayout({ children }: { children: ReactNode }) {
  return <SuperAdminOnlyPageGate>{children}</SuperAdminOnlyPageGate>;
}
