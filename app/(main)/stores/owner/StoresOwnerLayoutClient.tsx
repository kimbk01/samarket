"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { enterOwnerHubSecondaryFetchSchedule, leaveOwnerHubSecondaryFetchSchedule } from "@/lib/business/owner-hub-secondary-fetch-queue";
import { OwnerDashboardWaterfallMount } from "@/components/business/owner/OwnerDashboardWaterfallMount";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";
import { BusinessAdminShell } from "@/components/business/admin/BusinessAdminShell";
import { OwnerHubRuntimeProvider } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { StoresOwnerApplyShell } from "@/components/business/owner/StoresOwnerApplyShell";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

/**
 * `/stores/owner/*` 클라이언트 분기 — 서버 `layout.tsx` 가 매장 목록 시드 후에도
 * 클라 내비게이션·쿼리 변화에 맞춰 apply / hub / guarded 를 구분한다.
 *
 * CONTRACT (Phase 5) — hub ↔ stack must **not** remount Runtime/Shell/Guard as separate trees.
 * Leaving hub used to swap `OwnerHubRuntimeProvider+Shell(initialStores)` for
 * `StoreBusinessGuard+Shell(no seed)` → Guard pulse, `/api/me/stores` remount fan-out,
 * Runtime tear-down. Keep one persistent tree; only `enforce` / `entry` / waterfall toggle.
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
    return <StoresOwnerApplyShell>{children}</StoresOwnerApplyShell>;
  }

  return (
    <OwnerHubRuntimeProvider initialStores={initialStores}>
      {isHub ? <OwnerDashboardWaterfallMount /> : null}
      <StoreBusinessGuard enforce={!isHub}>
        <BusinessAdminShell entry={isHub ? "hub" : "guarded"} initialStores={initialStores}>
          {children}
        </BusinessAdminShell>
      </StoreBusinessGuard>
    </OwnerHubRuntimeProvider>
  );
}
