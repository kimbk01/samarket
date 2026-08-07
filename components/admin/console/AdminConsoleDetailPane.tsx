"use client";

import type { ReactNode } from "react";

/** Presentation-only detail column. No domain/writer logic. */
export function AdminConsoleDetailPane({
  children,
  header,
  footer,
  hiddenOnNarrowWhenList,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  /** When true, hide detail on <md until a row is selected. */
  hiddenOnNarrowWhenList?: boolean;
}) {
  return (
    <section
      className={[
        "admin-console-detail-pane flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--admin-console-surface,var(--sam-surface))]",
        hiddenOnNarrowWhenList ? "hidden lg:flex" : "flex",
      ].join(" ")}
      data-admin-console-pane="detail"
    >
      {header ? (
        <div className="shrink-0 border-b border-[var(--admin-console-border,var(--sam-border))] px-3 py-2">
          {header}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-[var(--admin-console-border,var(--sam-border))] px-3 py-2">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
