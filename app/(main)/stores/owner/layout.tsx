"use client";

import { usePathname } from "next/navigation";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";
import { BusinessAdminShell } from "@/components/business/admin/BusinessAdminShell";

/**
 * `/stores/owner/*` 캐노니컬 매장 운영 셸.
 *
 * 분기:
 * - `/stores/owner`            허브(승인전·신청대기 등 다양한 상태) → 자체 헤더로 단순 렌더
 * - `/stores/owner/apply`      신청 폼 → 풀폭 단순 레이아웃
 * - 나머지 `/stores/owner/*`   승인 매장 운영 화면 → `BusinessAdminShell` (좌측 사이드바)
 *
 * 옛 `/my/business/*`, `/mypage/business/*` 는 모두 본 경로로 리다이렉트된다(`/stores/owner` 단일 진입).
 */
export default function StoresOwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const isApply = pathname.startsWith("/stores/owner/apply");
  const isHub = pathname === "/stores/owner";

  if (isApply || isHub) {
    return <div className="min-h-screen bg-background pb-4">{children}</div>;
  }

  return (
    <StoreBusinessGuard>
      <BusinessAdminShell>{children}</BusinessAdminShell>
    </StoreBusinessGuard>
  );
}
