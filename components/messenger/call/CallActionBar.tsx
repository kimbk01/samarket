"use client";

import type { CallActionItem } from "./call-ui.types";
import { CallActionButton } from "./CallActionButton";

export function CallActionBar({
  actions,
  compact = false,
  theme,
  variant = "default",
}: {
  actions: CallActionItem[];
  compact?: boolean;
  theme?: "starbucks";
  variant?: "default" | "control" | "list";
}) {
  if (actions.length === 0) return null;
  const themed = theme === "starbucks";
  return (
    <div
      className={
        themed
          ? `flex w-full flex-nowrap items-start justify-between px-[clamp(0.25rem,2vw,0.75rem)] ${compact ? "gap-[clamp(0.45rem,2vw,0.75rem)]" : "gap-[clamp(0.35rem,1.8vw,0.9rem)]"}`
          : `flex w-full flex-wrap items-start justify-center ${compact ? "gap-x-4 gap-y-3" : "gap-x-5 gap-y-4"} `.trim()
      }
    >
      {actions.map((item) => (
        <CallActionButton key={item.id} item={item} theme={theme} variant={variant} />
      ))}
    </div>
  );
}
