"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  DIBAY_CATEGORY_RAIL_HOST_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
  DIBAY_SECONDARY_TAB_TRACK_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";

type Props = {
  /** Fixed leading control (e.g. 최신순 sort chip) */
  leading?: ReactNode;
  /** Scrollable tab pills */
  children: ReactNode;
  /** Trailing control (e.g. messenger group create) */
  trailing?: ReactNode;
  /** tablist / presentation on the scroll track */
  trackRole?: "tablist" | "presentation";
  trackAriaLabel?: string;
  /** Host shows bottom divider (default true) */
  bordered?: boolean;
  /** `secondary` | `category` — data-dibay-nav */
  navRole?: "secondary" | "category";
  /** Extra host className */
  hostClassName?: string;
  allowDragFromInteractive?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/**
 * Community / Trade / Chat 2단 탭 행 SSOT.
 * Geometry: gutter · row 44 · gap 8 · dibay-secondary-tabs track (px-0).
 */
export const DibaySecondaryTabRow = forwardRef<HTMLDivElement, Props>(function DibaySecondaryTabRow(
  {
    leading,
    children,
    trailing,
    trackRole = "tablist",
    trackAriaLabel,
    bordered = true,
    navRole = "secondary",
    hostClassName = "",
    allowDragFromInteractive = true,
    className = "",
    ...rest
  },
  trackRef
) {
  const hostBase =
    navRole === "category"
      ? `${DIBAY_CATEGORY_RAIL_HOST_CLASS}${
          bordered
            ? " border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))]"
            : ""
        }`
      : bordered
        ? DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS
        : DIBAY_CHROME_SECONDARY_HOST_CLASS;

  return (
    <div
      className={`${hostBase} w-full min-w-0 ${hostClassName}`.trim()}
      data-dibay-nav={navRole}
      {...rest}
    >
      <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>
        <div className={`${DIBAY_SECONDARY_TAB_ROW_CLASS} ${className}`.trim()}>
          {leading}
          <HorizontalDragScroll
            ref={trackRef}
            allowDragFromInteractive={allowDragFromInteractive}
            className={DIBAY_SECONDARY_TAB_TRACK_CLASS}
            style={{ WebkitOverflowScrolling: "touch" }}
            role={trackRole}
            aria-label={trackAriaLabel}
          >
            {children}
          </HorizontalDragScroll>
          {trailing}
        </div>
      </div>
    </div>
  );
});
