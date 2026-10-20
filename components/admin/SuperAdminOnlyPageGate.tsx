import type { ReactNode } from "react";
import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { canViewSuperAdminOnlyPage } from "@/lib/admin/access/require-super-admin-page";

/**
 * 서버 컴포넌트 — super_admin 이 아니면 기존 접근 거부 패널을 렌더한다.
 * 내부 운영 도구 세그먼트의 `layout.tsx` 에서 사용(하위 `[id]`·`create` 페이지까지 함께 보호).
 */
export async function SuperAdminOnlyPageGate({ children }: { children: ReactNode }) {
  if (!(await canViewSuperAdminOnlyPage())) return <AdminAccessDeniedPanel />;
  return <>{children}</>;
}
