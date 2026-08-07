"use client";

import type { ReactNode } from "react";

/** Presentation-only console toolbar row. No domain logic. */
export function AdminConsoleToolbar({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-console-toolbar flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--admin-console-border,var(--sam-border))] bg-[var(--admin-console-surface,var(--sam-surface))] px-3 py-2 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--admin-console-fg,var(--sam-fg))]">
          {title}
        </div>
        {meta ? (
          <div className="mt-0.5 truncate text-[11px] text-[var(--admin-console-muted,var(--sam-muted))]">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
