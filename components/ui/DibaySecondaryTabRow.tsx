"use client";

import { forwardRef, useCallback, useRef, type HTMLAttributes, type ReactNode } from "react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  DIBAY_CATEGORY_RAIL_HOST_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
  DIBAY_SECONDARY_TAB_TRACK_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";
import { useScrollSelectedTabIntoView } from "@/lib/ui/use-scroll-selected-tab-into-view";

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
  /**
   * 탭 계층 (크롬 S3 2026-11-02) — `section` = 2단 섹션 전환(밑줄) · `filter` = 3단 필터·주제(칩 4px).
   * 생략 시 `navRole="category"` 는 filter, 그 외 section.
   */
  tier?: "section" | "filter";
  /** Extra host className */
  hostClassName?: string;
  allowDragFromInteractive?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/**
 * Community / Trade / Chat 2단 탭 행 SSOT.
 * Geometry: gutter · row 44 · gap 8 · dibay-secondary-tabs track (px-0).
 * 모양은 `tier` (section 밑줄 · filter 칩) — `app/dibay-chrome-ssot.css` 크롬 S3 절. 선택 탭은 자동으로 화면 안으로 스크롤.
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
    tier,
    hostClassName = "",
    allowDragFromInteractive = true,
    className = "",
    ...rest
  },
  trackRef
) {
  const localTrackRef = useRef<HTMLDivElement | null>(null);
  const setTrackRef = useCallback(
    (node: HTMLDivElement | null) => {
      localTrackRef.current = node;
      if (typeof trackRef === "function") trackRef(node);
      else if (trackRef) trackRef.current = node;
    },
    [trackRef]
  );
  useScrollSelectedTabIntoView(localTrackRef);
  const resolvedTier = tier ?? (navRole === "category" ? "filter" : "section");
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
      data-dibay-tab-tier={resolvedTier}
      {...rest}
    >
      <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>
        <div className={`${DIBAY_SECONDARY_TAB_ROW_CLASS} ${className}`.trim()}>
          {leading}
          <HorizontalDragScroll
            ref={setTrackRef}
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
