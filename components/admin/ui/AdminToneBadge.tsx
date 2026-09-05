/**
 * ARO-OPS-UX-002-B8 — presentation-only status tone (not domain lifecycle SSOT).
 */

import type { ReactNode } from "react";

export type AdminTone = "neutral" | "waiting" | "progress" | "success" | "warning" | "danger";

const TONE_CLASS: Record<AdminTone, string> = {
  neutral: "border-sam-border bg-sam-surface-muted text-sam-fg",
  waiting: "border-amber-600/40 bg-amber-50 text-amber-950",
  progress: "border-sky-600/40 bg-sky-50 text-sky-950",
  success: "border-emerald-600/40 bg-emerald-50 text-emerald-950",
  warning: "border-orange-600/40 bg-orange-50 text-orange-950",
  danger: "border-red-700/40 bg-red-50 text-red-900",
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
