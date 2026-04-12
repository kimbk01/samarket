import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-sam-surface-muted text-sam-fg",
  success: "bg-emerald-100 text-emerald-900",
  warning: "bg-amber-100 text-amber-950",
  danger: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-950",
  muted: "bg-sam-border-soft text-sam-fg",
};

export function BusinessStatusBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
