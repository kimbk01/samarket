"use client";

import type { ReactNode } from "react";

type AdminConsoleStateKind = "loading" | "empty" | "error";

/** Presentation-only empty/loading/error surface. */
export function AdminConsoleState({
  kind,
  children,
  action,
}: {
  kind: AdminConsoleStateKind;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tone =
    kind === "error"
      ? "border-sam-warning/20 bg-sam-warning-soft text-sam-warning"
      : "border-[var(--admin-console-border,var(--sam-border))] bg-[var(--admin-console-surface,var(--sam-surface))] text-[var(--admin-console-muted,var(--sam-muted))]";

  return (
    <div
      className={`admin-console-state flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-sm border px-4 py-8 text-center text-sm ${tone}`}
      data-admin-console-state={kind}
      role={kind === "error" ? "alert" : undefined}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}
