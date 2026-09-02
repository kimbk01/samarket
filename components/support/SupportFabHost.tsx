"use client";

import { BodyPortal } from "@/components/layout/BodyPortal";
import { SupportFab } from "@/components/support/SupportFab";
import { useSupportFabVisible } from "@/lib/support/use-support-context";
import { useSupportFabRegistry } from "@/lib/support/support-fab-registry";
import {
  BOTTOM_NAV_FAB_LAYOUT,
  MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

/**
 * Global Support FAB host — renders only when a screen published `enabled: true`.
 * DO NOT use pathname or role for visibility.
 */
export function SupportFabHost() {
  const visible = useSupportFabVisible();
  const { context } = useSupportFabRegistry();
  const bottomNavClearance = useBottomNavOccupiesClearance();

  if (!visible) return null;

  const bottomClass = bottomNavClearance
    ? BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass
    : "bottom-[calc(var(--safe-bottom)+16px)]";

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
