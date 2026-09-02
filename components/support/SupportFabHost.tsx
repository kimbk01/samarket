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
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useSyncExternalStore } from "react";

/**
 * Support FAB only — modal host is mounted eagerly by ConditionalAppShell.
 */
export function SupportFabHost() {
  const visible = useSupportFabVisible();
  const { context } = useSupportFabRegistry();
  const bottomNavClearance = useBottomNavOccupiesClearance();
  const modalOpen = useSyncExternalStore(
    subscribeSupportModalState,
    () => getSupportModalState().phase === "open",
    () => false
  );

  const bottomClass = bottomNavClearance
    ? BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass
    : "bottom-[calc(var(--safe-bottom)+16px)]";

  const showFab = visible && !modalOpen;
  if (!showFab) return null;

  return (
    <BodyPortal>
      <div
        className={`pointer-events-none fixed inset-x-0 ${bottomClass} ${MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS}`}
        data-support-fab-host="1"
      >
        <div className={`${APP_MAIN_COLUMN_CLASS} flex justify-end px-4`}>
          <SupportFab context={context} />
        </div>
      </div>
    </BodyPortal>
  );
}
