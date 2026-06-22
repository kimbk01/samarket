"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { callV3Accept, callV3Reject } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import { buildIncomingCallPreviewHref } from "@/lib/community-messenger/incoming-call-preview-route";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";

/**
 * Foreground incoming banner — legacy `IncomingCallBanner` design, V3 accept/reject actions.
 */
export function CallV3IncomingBanner() {
  const router = useRouter();
  const { safeT } = useI18n();
  const phase = useCallV3Store((s) => s.phase);
  const identity = useCallV3Store((s) => s.identity);
  const shownCallIdRef = useRef<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

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

  if (typeof document === "undefined" || !portalReady) {
    return null;
  }

  const callId = identity.callId;
  const peerLabel =
    identity.peerLabel?.trim() ||
    (identity.mediaType === "video"
      ? safeT("cm_ui_call_log_video_incoming", {
          fallbackKo: "영상 통화 수신",
          fallbackEn: "Incoming video call",
        })
      : safeT("cm_ui_call_log_voice_incoming", {
          fallbackKo: "음성 통화 수신",
          fallbackEn: "Incoming voice call",
        }));

  const banner = (
    <div
      data-foreground-incoming-call-host
      className={`pointer-events-none fixed inset-x-0 top-0 ${MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS}`}
    >
      <IncomingCallBanner
        sessionId={callId}
        peerLabel={peerLabel}
        peerAvatarUrl={identity.peerAvatarUrl ?? null}
        callKind={identity.mediaType === "video" ? "video" : "voice"}
        ringTimeoutSeconds={DEFAULT_INCOMING_RING_TIMEOUT_SECONDS}
        startedAt={identity.createdAt ?? null}
        busyReject={false}
        busyAccept={false}
        onExpand={() => router.push(buildIncomingCallPreviewHref(callId))}
        onReject={() => void callV3Reject(callId)}
        onAccept={() => void callV3Accept(callId, router)}
        bannerDataTestId="call-v3-incoming-banner"
        acceptDataTestId="call-v3-incoming-accept"
        rejectDataTestId="call-v3-incoming-reject"
      />
    </div>
  );

  return createPortal(banner, document.body);
}
