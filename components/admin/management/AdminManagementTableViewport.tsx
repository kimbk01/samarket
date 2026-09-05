"use client";

import type { ReactNode, Ref, UIEventHandler } from "react";

/**
 * Sole horizontal overflow owner for management tables.
 * Body / page must not scroll on X; this viewport may.
 */
export function AdminManagementTableViewport(props: {
  children: ReactNode;
  className?: string;
  onHorizontalScroll?: UIEventHandler<HTMLDivElement>;
  viewportRef?: Ref<HTMLDivElement>;
}) {
  const { children, className = "", onHorizontalScroll, viewportRef } = props;
  return (
    <div
      ref={viewportRef}
      onScroll={onHorizontalScroll}
      data-admin-mgmt-table-viewport="1"
      className={[
        "w-full max-w-full overflow-x-auto overflow-y-visible rounded-ui-rect border border-sam-border bg-sam-surface [-webkit-overflow-scrolling:touch]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
