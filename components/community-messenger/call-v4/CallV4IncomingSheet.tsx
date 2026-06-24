"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IncomingCallBanner } from "@/components/messenger/call/IncomingCallBanner";
import { callV4Accept, callV4Reject } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  canRenderWebIncomingSheet,
  isCallV4AcceptedTransitionOwner,
  isCallV4NativeAcceptingSurface,
  subscribeCallV4NativeAcceptingSurfaceSignal,
  subscribeCallV4SurfaceOwnerSignal,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { buildIncomingCallPreviewHref } from "@/lib/community-messenger/incoming-call-preview-route";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";

/** Foreground incoming sheet — single Web owner when V4 lane ON. */
export function CallV4IncomingSheet() {
  const router = useRouter();
  const { safeT } = useI18n();
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity);
  const shownCallIdRef = useRef<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [ownerTick, setOwnerTick] = useState(0);
  const [acceptingTick, setAcceptingTick] = useState(0);

  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    return subscribeCallV4NativeAcceptingSurfaceSignal(() => {
      setAcceptingTick((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeCallV4SurfaceOwnerSignal(() => {
      setOwnerTick((value) => value + 1);
    });
  }, []);

  const callId = identity?.callId?.trim() ?? "";
  const isIncomingRinging =
    phase === "incoming_ringing" && Boolean(callId) && identity?.direction === "incoming";

  void ownerTick;
  void acceptingTick;

  const nativeAccepting = isCallV4NativeAcceptingSurface(callId);
  const acceptedTransition = isCallV4AcceptedTransitionOwner(callId);
  const renderDecision = canRenderWebIncomingSheet({ callId, phase });

  useEffect(() => {
    if (!isIncomingRinging) return;
    if (nativeAccepting || acceptedTransition) {
      if (shownCallIdRef.current !== callId) {
        logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
        shownCallIdRef.current = callId;
      }
      return;
    }
    if (!renderDecision.canRender) {
      if (shownCallIdRef.current !== callId) {
        logCallV4("incoming_sheet_suppressed", { callId, reason: renderDecision.reason });
        shownCallIdRef.current = callId;
      }
      return;
    }
    if (shownCallIdRef.current === callId) return;
    shownCallIdRef.current = callId;
    logCallV4("incoming_sheet_show", { callId });
  }, [
    acceptedTransition,
    callId,
    isIncomingRinging,
    nativeAccepting,
    renderDecision.canRender,
    renderDecision.reason,
  ]);

  if (!isIncomingRinging || !identity) return null;
  if (nativeAccepting || acceptedTransition) return null;
  if (typeof document === "undefined" || !portalReady || !renderDecision.canRender) return null;

  const peerLabel =
    identity.peerLabel?.trim() ||
    safeT("cm_ui_call_log_voice_incoming", {
      fallbackKo: "음성 통화 수신",
      fallbackEn: "Incoming voice call",
    });

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
        onReject={() => void callV4Reject(callId, router)}
        onAccept={() => void callV4Accept(callId, router, { source: "sheet" })}
        bannerDataTestId="call-v4-incoming-sheet"
        acceptDataTestId="call-v4-incoming-accept"
        rejectDataTestId="call-v4-incoming-reject"
      />
    </div>
  );

  return createPortal(banner, document.body);
}
