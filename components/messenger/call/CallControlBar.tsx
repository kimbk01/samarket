"use client";

import type { CallActionItem } from "@/components/messenger/call/call-ui.types";
import { CallActionBar } from "@/components/messenger/call/CallActionBar";

export function CallControlBar({
  primaryActions,
  secondaryActions,
  theme,
  compact = false,
}: {
  primaryActions: CallActionItem[];
  secondaryActions?: CallActionItem[];
  theme?: "starbucks";
  compact?: boolean;
}) {
  if (!primaryActions.length && !secondaryActions?.length) return null;
  const themed = theme === "starbucks";

  return (
    <div
      className={`call-control-bar mx-auto w-full max-w-[430px] rounded-[28px] px-3 py-3 backdrop-blur-xl ${
        themed
          ? "bg-[#1E1E1E]/72 shadow-[0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-[#D4E9E2]/16"
          : "bg-black/52 shadow-[0_8px_24px_rgba(0,0,0,0.22)] ring-1 ring-white/12"
      }`}
    >
      <CallActionBar actions={primaryActions} compact={compact} theme={theme} variant="control" />
      {secondaryActions?.length ? (
        <div className="mt-3">
          <CallActionBar actions={secondaryActions} compact theme={theme} variant="control" />
        </div>
      ) : null}
    </div>
  );
}
