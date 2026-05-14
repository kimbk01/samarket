"use client";

import { usePathname } from "next/navigation";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";
import { BusinessAdminShell } from "@/components/business/admin/BusinessAdminShell";

/**
 * `/stores/owner/*` 클라이언트 분기 — 서버 `layout.tsx` 가 매장 목록 시드 후에도
 * 클라 내비게이션·쿼리 변화에 맞춰 apply / hub / guarded 를 구분한다.
 */
export function StoresOwnerLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const isApply = pathname.startsWith("/stores/owner/apply");
  const isHub = pathname === "/stores/owner";

  if (isApply) {
    return (
      <div className="min-h-screen bg-[var(--biz-app-bg)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
    );
  }

  if (isHub) {
    return <BusinessAdminShell entry="hub">{children}</BusinessAdminShell>;
  }

  return (
    <StoreBusinessGuard>
      <BusinessAdminShell>{children}</BusinessAdminShell>
    </StoreBusinessGuard>
  );
}
