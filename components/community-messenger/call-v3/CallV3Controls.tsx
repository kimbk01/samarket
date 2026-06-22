"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { callV3Cancel, callV3End } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

type CallV3ControlsProps = {
  callId: string;
  router: { replace: (href: string) => void; push?: (href: string) => void };
};

export function CallV3Controls({ callId, router }: CallV3ControlsProps) {
  const { safeT } = useI18n();
  const phase = useCallV3Store((s) => s.phase);
  const showCancel = phase === "outgoing_ringing" || phase === "creating";
  const showEnd = phase === "connected";

  if (!showCancel && !showEnd) {
    return null;
  }

  return (
    <div className="flex w-full justify-center px-6 pb-10">
      {showCancel ? (
        <button
          type="button"
          className="min-h-12 min-w-[8rem] rounded-ui-rect border border-sam-border bg-sam-surface px-6 text-sm font-semibold text-sam-fg"
          onClick={() => void callV3Cancel(callId, router)}
        >
          {safeT("cm_ui_cancel_short", {
            fallbackKo: "취소",
            fallbackEn: "Cancel",
          })}
        </button>
      ) : null}
      {showEnd ? (
        <button
          type="button"
          data-testid="call-v3-end-button"
          className="min-h-12 min-w-[8rem] rounded-ui-rect border border-sam-danger/15 bg-sam-danger-soft px-6 text-sm font-semibold text-sam-danger"
          onClick={() => void callV3End(callId, router)}
        >
          {safeT("cm_ui_end_call", {
            fallbackKo: "통화 종료",
            fallbackEn: "End call",
          })}
        </button>
      ) : null}
    </div>
  );
}
