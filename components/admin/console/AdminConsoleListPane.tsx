"use client";

import type { ReactNode } from "react";

/** Presentation-only list column. No fetch/filter logic. */
export function AdminConsoleListPane({
  children,
  header,
  hiddenOnNarrowWhenDetail,
}: {
  children: ReactNode;
  header?: ReactNode;
  /** When true, hide list on <md when a detail is showing (compact stack mode). */
  hiddenOnNarrowWhenDetail?: boolean;
}) {
  return (
    <aside
      className={[
        "admin-console-list-pane flex min-h-0 min-w-0 flex-col border-[var(--admin-console-border,var(--sam-border))] bg-[var(--admin-console-surface,var(--sam-surface))]",
        "lg:w-[min(22rem,38%)] lg:shrink-0 lg:border-r",
        hiddenOnNarrowWhenDetail ? "hidden lg:flex" : "flex",
        "w-full flex-1",
      ].join(" ")}
      data-admin-console-pane="list"
    >
      {header ? <div className="shrink-0 border-b border-[var(--admin-console-border,var(--sam-border))] px-3 py-2">{header}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</div>
    </aside>
  );
}
