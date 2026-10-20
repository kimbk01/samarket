/**
 * ARO-OPS-UX-002-B8 — presentation-only status tone (not domain lifecycle SSOT).
 */

import type { ReactNode } from "react";

export type AdminTone = "neutral" | "waiting" | "progress" | "success" | "warning" | "danger";

const TONE_CLASS: Record<AdminTone, string> = {
  neutral: "border-sam-border bg-sam-surface-muted text-sam-fg",
  waiting: "border-sam-warning/40 bg-sam-warning-soft text-sam-warning",
  progress: "border-sam-info/40 bg-sam-info-soft text-sam-info",
  success: "border-sam-success/40 bg-sam-success-soft text-sam-success",
  warning: "border-sam-warning/60 bg-sam-warning-soft text-sam-warning",
  danger: "border-sam-danger/40 bg-sam-danger-soft text-sam-danger",
};

export function AdminToneBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: AdminTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-admin-tone={tone}
      className={[
        "inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-ui-rect border px-2 py-0.5 text-[12px] font-semibold leading-4",
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function AdminUnavailableChip({ ko }: { ko: boolean }) {
  return (
    <span data-admin-unavailable="1">
      <AdminToneBadge tone="warning">{ko ? "확인 불가" : "UNAVAILABLE"}</AdminToneBadge>
    </span>
  );
}
