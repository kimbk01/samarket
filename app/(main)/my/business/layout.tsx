"use client";

import { usePathname } from "next/navigation";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";
import { BusinessAdminShell } from "@/components/business/admin/BusinessAdminShell";

export default function MyBusinessLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isApply = pathname?.startsWith("/my/business/apply") ?? false;

  /** 신청 플로우만 풀폭 단순 레이아웃 — 그 외(기본 정보·매장 프로필 등)는 좌측 사이드바 `BusinessAdminShell` */
  if (isApply) {
    return <div className="min-h-screen bg-background pb-4">{children}</div>;
  }

  return (
    <StoreBusinessGuard>
      <BusinessAdminShell>{children}</BusinessAdminShell>
    </StoreBusinessGuard>
  );
}
