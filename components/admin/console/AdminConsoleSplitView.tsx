"use client";

import type { ReactNode } from "react";

/**
 * Presentation-only list|detail shell for platform Admin console.
 * No domain authority, fetch, or writers.
 */
export function AdminConsoleSplitView({
  toolbar,
  list,
  detail,
  className,
}: {
  toolbar?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "admin-console-split flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-admin-console="split"
    >
      {toolbar}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {list}
        {detail}
      </div>
    </div>
  );
}
