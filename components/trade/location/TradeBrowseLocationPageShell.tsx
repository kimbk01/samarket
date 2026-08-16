"use client";

import type { ReactNode } from "react";
import { DefaultHeader } from "@/components/layout/sector-header";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";

/** Compact map — phone small; tablet taller (page stack, not 520px sheet). */
export const TRADE_BROWSE_LOCATION_MAP_FRAME_CLASS =
  "relative h-[clamp(7rem,18dvh,9rem)] min-h-[7rem] shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface-muted md:h-[clamp(10rem,26vh,13rem)] md:min-h-[10rem]";

export function TradeBrowseLocationPageShell({
  title,
  backHref,
  rightSlot,
  children,
  footer,
}: {
  title: ReactNode;
  backHref: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-sam-app text-sam-fg">
      <div className="shrink-0">
        <DefaultHeader
          embedded
          flat
          title={title}
          backHref={backHref}
          showBack
          rightSlot={rightSlot}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {footer != null ? (
        <div
          className={`shrink-0 border-t border-sam-border bg-sam-app px-4 pt-2 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}
        >
          {footer}
        </div>
      ) : (
        <div className={`shrink-0 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`} aria-hidden />
      )}
    </div>
  );
}
