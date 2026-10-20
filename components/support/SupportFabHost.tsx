"use client";

import { BodyPortal } from "@/components/layout/BodyPortal";
import { SupportFab } from "@/components/support/SupportFab";
import { useSupportFabVisible } from "@/lib/support/use-support-context";
import { useSupportFabRegistry } from "@/lib/support/support-fab-registry";
import {
  getSupportModalState,
  subscribeSupportModalState,
} from "@/lib/support/support-modal-controller";
import {
  BOTTOM_NAV_FAB_LAYOUT,
  MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import {
  getOwnerBottomNavOccupiesClearance,
  subscribeOwnerBottomNavOccupiesClearance,
} from "@/lib/business/owner-bottom-nav-occupancy";
import {
  getOwnerCompactShellBodyFlag,
  subscribeOwnerCompactShellBodyFlagStore,
} from "@/lib/business/owner-compact-shell-layout";
import {
  getOwnerOpsDrawerOpen,
  subscribeOwnerOpsDrawerOpen,
} from "@/lib/business/owner-ops-drawer-open";
import { OWNER_FAB_BOTTOM_OFFSET_CLASS } from "@/lib/business/owner-shell-geometry";
import { OWNER_OVERLAY_Z_CLASS } from "@/lib/business/owner-overlay-layers";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useFixedBottomBarOccupiedPx } from "@/lib/layout/use-fixed-bottom-bar-occupied-px";
import { resolveSupportFabBottomPlacement } from "@/lib/support/support-fab-bottom-placement";
import { useSyncExternalStore } from "react";

/**
 * Support FAB only — modal host is mounted eagerly by ConditionalAppShell.
 * Owner Admin: geometry/z follow Owner shell (not main BottomNav), even when
 * OwnerMobileBottomNav unmounts under the ops drawer.
 */
export function SupportFabHost() {
  const visible = useSupportFabVisible();
  const { context } = useSupportFabRegistry();
  const bottomNavClearance = useBottomNavOccupiesClearance();
  const ownerBottomNavClearance = useSyncExternalStore(
    subscribeOwnerBottomNavOccupiesClearance,
    getOwnerBottomNavOccupiesClearance,
    () => false
  );
  const ownerShellActive = useSyncExternalStore(
    subscribeOwnerCompactShellBodyFlagStore,
    getOwnerCompactShellBodyFlag,
    () => false
  );
  const ownerDrawerOpen = useSyncExternalStore(
    subscribeOwnerOpsDrawerOpen,
    getOwnerOpsDrawerOpen,
    () => false
  );
  const modalOpen = useSyncExternalStore(
    subscribeSupportModalState,
    () => getSupportModalState().phase === "open",
    () => false
  );

  const useOwnerFabLayout = ownerShellActive;
  const showFab = visible && !modalOpen && !ownerDrawerOpen;
  /** 화면 하단 고정 바(내정보 CTA·댓글 입력바·오너 폼 하단 바) 실측 점유 높이 — 그 위로 비킨다 */
  const fixedBarOccupiedPx = useFixedBottomBarOccupiedPx(showFab);
  const placement = resolveSupportFabBottomPlacement({
    ownerShell: useOwnerFabLayout,
    bottomNavClearance,
    fixedBarOccupiedPx,
    ownerClass: OWNER_FAB_BOTTOM_OFFSET_CLASS,
    bottomNavClass: BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass,
  });

  const zClass = useOwnerFabLayout
    ? OWNER_OVERLAY_Z_CLASS.fab
    : MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS;

  if (!showFab) return null;

  return (
    <BodyPortal>
      <div
        className={`pointer-events-none fixed inset-x-0 ${placement.className} ${zClass}`}
        style={placement.style}
        data-support-fab-host="1"
        data-fixed-bar-clearance={fixedBarOccupiedPx > 0 ? "1" : "0"}
        data-owner-nav-clearance={ownerBottomNavClearance ? "1" : "0"}
        data-owner-shell-fab={useOwnerFabLayout ? "1" : "0"}
      >
        <div className={`${APP_MAIN_COLUMN_CLASS} flex justify-end px-4`}>
          <SupportFab context={context} />
        </div>
      </div>
    </BodyPortal>
  );
}
