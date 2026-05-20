"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { enterOwnerHubSecondaryFetchSchedule, leaveOwnerHubSecondaryFetchSchedule } from "@/lib/business/owner-hub-secondary-fetch-queue";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";
import { BusinessAdminShell } from "@/components/business/admin/BusinessAdminShell";
import { OwnerHubRuntimeProvider } from "@/components/business/owner/OwnerHubRuntimeProvider";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

/**
 * `/stores/owner/*` 클라이언트 분기 — 서버 `layout.tsx` 가 매장 목록 시드 후에도
 * 클라 내비게이션·쿼리 변화에 맞춰 apply / hub / guarded 를 구분한다.
 */
export function StoresOwnerLayoutClient({
  children,
  initialStores = null,
}: {
  children: React.ReactNode;
  initialStores?: StoreRow[] | null;
}) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const isApply = pathname.startsWith("/stores/owner/apply");
  const isHub = pathname === "/stores/owner";

  useLayoutEffect(() => {
    if (!isHub) return;
    enterOwnerHubSecondaryFetchSchedule(pathname);
    return () => leaveOwnerHubSecondaryFetchSchedule();
  }, [isHub, pathname]);

  if (isApply) {
    return (
      <div className="min-h-screen bg-[var(--biz-app-bg)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
    );
  }

  if (isHub) {
    return (
      <OwnerHubRuntimeProvider initialStores={initialStores}>
        <BusinessAdminShell entry="hub">
          {children}
        </BusinessAdminShell>
      </OwnerHubRuntimeProvider>
    );
  }

  return (
    <StoreBusinessGuard>
      <BusinessAdminShell>{children}</BusinessAdminShell>
    </StoreBusinessGuard>
  );
}
