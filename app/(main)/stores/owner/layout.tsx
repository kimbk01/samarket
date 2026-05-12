"use client";

import { usePathname } from "next/navigation";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";
import { BusinessAdminShell } from "@/components/business/admin/BusinessAdminShell";

/**
 * `/stores/owner/*` 캐노니컬 매장 운영 셸.
 *
 * 분기:
 * - `/stores/owner`            허브 — `BusinessAdminShell` (`entry="hub"`, 심사 전·매장 없음도 본문 유지)
 * - `/stores/owner/apply`      신청 폼 — 고정 상단 `StoresOwnerStackHeader`(뒤로 → `/stores/owner`), 본문은 `biz-app-bg`·섹션 카드 톤
 * - 나머지 `/stores/owner/*`   `StoreBusinessGuard` + `BusinessAdminShell` (좌측 사이드바)
 *
 * 옛 `/my/business/*`, `/mypage/business/*` 는 모두 본 경로로 리다이렉트된다(`/stores/owner` 단일 진입).
 */
export default function StoresOwnerLayout({ children }: { children: React.ReactNode }) {
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
