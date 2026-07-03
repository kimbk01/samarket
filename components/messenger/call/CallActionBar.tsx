"use client";

import type { CallActionItem } from "./call-ui.types";
import { CallActionButton } from "./CallActionButton";

export function CallActionBar({
  actions,
  compact = false,
  theme,
}: {
  actions: CallActionItem[];
  compact?: boolean;
  theme?: "starbucks";
}) {
  if (actions.length === 0) return null;
  const themed = theme === "starbucks";
  return (
    <div
      className={
        themed
          ? `call-control-bar flex w-full flex-nowrap items-start justify-between px-[clamp(0.25rem,2vw,0.75rem)] shadow-[0_8px_24px_rgba(0,0,0,0.2)] ${compact ? "gap-3" : "gap-3"}`
          : `flex w-full flex-wrap items-start justify-center ${compact ? "gap-x-4 gap-y-3" : "gap-x-5 gap-y-4"} `.trim()
      }
    >
      {actions.map((item) => (
        <CallActionButton key={item.id} item={item} theme={theme} />
      ))}
    </div>
  );
}
