"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { callV3Accept, callV3Reject } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

/**
 * Foreground incoming banner — single owner per callId when phase is incoming_ringing.
 * Layout: peer row + full-width accept/reject row (narrow screens must show both buttons).
 */
export function CallV3IncomingBanner() {
  const router = useRouter();
  const { safeT } = useI18n();
  const phase = useCallV3Store((s) => s.phase);
  const identity = useCallV3Store((s) => s.identity);
  const shownCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    const callId = identity?.callId?.trim() ?? "";
    if (phase !== "incoming_ringing" || !callId || identity?.direction !== "incoming") return;
    if (shownCallIdRef.current === callId) return;
    shownCallIdRef.current = callId;
    logCallV3("incoming_banner_show", { callId });
  }, [identity?.callId, identity?.direction, phase]);

  if (phase !== "incoming_ringing" || !identity || identity.direction !== "incoming") {
    return null;
  }

  const mediaLabel =
    identity.mediaType === "video"
      ? safeT("cm_ui_call_log_video_incoming", {
          fallbackKo: "영상 통화 수신",
          fallbackEn: "Incoming video call",
        })
      : safeT("cm_ui_call_log_voice_incoming", {
          fallbackKo: "음성 통화 수신",
          fallbackEn: "Incoming voice call",
        });

  const peerName = identity.peerLabel?.trim() || mediaLabel;

  return (
    <div
      data-testid="call-v3-incoming-banner"
      className="fixed inset-x-0 top-0 z-[120] flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-lg">
        <div className="flex min-w-0 items-center gap-3">
          <SamarketThumbnail
            src={identity.peerAvatarUrl}
            alt={peerName}
            className="h-12 w-12 shrink-0 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sam-fg">{peerName}</p>
            <p className="truncate text-xs text-sam-muted">{mediaLabel}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="call-v3-incoming-accept"
            className="min-h-11 w-full rounded-ui-rect bg-sam-brand px-3 text-sm font-semibold text-white"
            onClick={() => void callV3Accept(identity.callId, router)}
          >
            {safeT("cm_ui_accept", { fallbackKo: "수락", fallbackEn: "Accept" })}
          </button>
          <button
            type="button"
            data-testid="call-v3-incoming-reject"
            className="min-h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm font-semibold text-sam-fg"
            onClick={() => void callV3Reject(identity.callId)}
          >
            {safeT("cm_ui_reject", { fallbackKo: "거절", fallbackEn: "Decline" })}
          </button>
        </div>
      </div>
    </div>
  );
}
