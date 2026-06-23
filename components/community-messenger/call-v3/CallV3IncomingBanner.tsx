"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { callV3Accept, callV3Reject } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import {
  shouldSuppressCallV3WebIncomingBanner,
  subscribeCallV3NativeIncomingSurfaceSignal,
} from "@/lib/community-messenger/call-v3/call-v3-incoming-surface";
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
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(() =>
    typeof document !== "undefined" ? document.visibilityState : "visible",
  );
  const [nativeSurfaceTick, setNativeSurfaceTick] = useState(0);

  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => setVisibilityState(document.visibilityState);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    return subscribeCallV3NativeIncomingSurfaceSignal(() => {
      setNativeSurfaceTick((value) => value + 1);
    });
  }, []);

  const callId = identity?.callId?.trim() ?? "";
  const isIncomingRinging =
    phase === "incoming_ringing" && Boolean(callId) && identity?.direction === "incoming";
  const bannerSuppress = shouldSuppressCallV3WebIncomingBanner({
    callId,
    visibilityState,
  });
  void nativeSurfaceTick;

  useEffect(() => {
    if (!isIncomingRinging) return;
    if (bannerSuppress.suppress) {
      if (shownCallIdRef.current !== callId) {
        logCallV3("incoming_banner_suppressed", {
          callId,
          reason: bannerSuppress.reason,
        });
        shownCallIdRef.current = callId;
      }
      return;
    }
    if (shownCallIdRef.current === callId) return;
    shownCallIdRef.current = callId;
    logCallV3("incoming_banner_show", { callId });
  }, [bannerSuppress.reason, bannerSuppress.suppress, callId, isIncomingRinging]);

  if (!isIncomingRinging || !identity) {
    return null;
  }

  if (typeof document === "undefined" || !portalReady) {
    return null;
  }

  if (bannerSuppress.suppress) {
    return null;
  }
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
