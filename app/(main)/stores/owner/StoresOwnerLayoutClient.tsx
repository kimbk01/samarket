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
import { OverlayScopeProvider } from "@/components/ui/dibay-overlay/overlay-scope";
import { deliveryScopeAttrs } from "@/lib/ui/delivery-scope";

/** 사장님 시트·다이얼로그(body 포털)도 `[data-delivery-scope="owner"]` 규칙을 받는다 */
const OWNER_SCOPE = deliveryScopeAttrs("owner");

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
  /**
   * Soft-nav within `/stores/owner/*` reuses this client layout instance.
   * Server layout skip only applies when the layout RSC is re-fetched (cold / outside → ensure).
   * When pathname becomes order-chat, do not keep Guard/Shell/Runtime mounted.
   */
  const isOrderChatEnsure =
    pathname === "/stores/owner/order-chat" ||
    pathname.startsWith("/stores/owner/order-chat/");

  useLayoutEffect(() => {
    if (!isHub) return;
    enterOwnerHubSecondaryFetchSchedule(pathname);
    return () => leaveOwnerHubSecondaryFetchSchedule();
  }, [isHub, pathname]);

  if (isApply) {
    return (
      <OverlayScopeProvider attrs={OWNER_SCOPE}>
        <StoresOwnerApplyShell>{children}</StoresOwnerApplyShell>
      </OverlayScopeProvider>
    );
  }

  /** 주문 채팅은 메신저 방 UI — 배달 스코프를 붙이지 않는다 */
  if (isOrderChatEnsure) {
    return <>{children}</>;
  }

  return (
    <OverlayScopeProvider attrs={OWNER_SCOPE}>
      <OwnerHubRuntimeProvider initialStores={initialStores}>
        {isHub ? <OwnerDashboardWaterfallMount /> : null}
        <StoreBusinessGuard enforce={!isHub}>
          <BusinessAdminShell entry={isHub ? "hub" : "guarded"} initialStores={initialStores}>
            {children}
          </BusinessAdminShell>
        </StoreBusinessGuard>
      </OwnerHubRuntimeProvider>
    </OverlayScopeProvider>
  );
}
