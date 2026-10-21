import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-sam-surface-muted text-sam-fg",
  success: "bg-sam-success-soft text-sam-fg",
  warning: "bg-sam-warning-soft text-sam-fg",
  danger: "bg-sam-danger-soft text-sam-danger",
  info: "bg-sam-info-soft text-sam-fg",
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
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
