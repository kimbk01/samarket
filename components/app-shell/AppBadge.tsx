import type { ReactNode } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type AppBadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export type AppBadgeProps = {
  children: ReactNode;
  tone?: AppBadgeTone;
  className?: string;
};

export function AppBadge({ children, tone = "neutral", className }: AppBadgeProps) {
  const c =
    tone === "primary"
      ? Sam.badge.primary
      : tone === "success"
        ? Sam.badge.success
        : tone === "warning"
          ? Sam.badge.warning
          : tone === "danger"
            ? Sam.badge.danger
            : tone === "info"
              ? Sam.badge.info
              : Sam.badge.neutral;
  return <span className={`${c} ${className ?? ""}`.trim()}>{children}</span>;
}
