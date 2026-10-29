import type { ReactNode } from "react";
import { SuperAdminOnlyPageGate } from "@/components/admin/SuperAdminOnlyPageGate";

/** IA-06: 운영 메모 = 「내부 도구」(최고관리자 전용 메뉴) — super_admin 전용 세그먼트 게이트. */
export default function SuperAdminOnlyToolLayout({ children }: { children: ReactNode }) {
  return <SuperAdminOnlyPageGate>{children}</SuperAdminOnlyPageGate>;
}
