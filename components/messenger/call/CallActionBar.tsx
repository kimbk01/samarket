"use client";

import type { CallActionItem } from "./call-ui.types";
import { CallActionButton } from "./CallActionButton";

export function CallActionBar({
  actions,
  compact = false,
}: {
  actions: CallActionItem[];
  compact?: boolean;
}) {
  if (actions.length === 0) return null;
  return (
    <div
      className={`flex w-full flex-wrap items-start justify-center ${compact ? "gap-x-4 gap-y-3" : "gap-x-5 gap-y-4"} `.trim()}
    >
      {actions.map((item) => (
        <CallActionButton key={item.id} item={item} />
      ))}
    </div>
  );
}
