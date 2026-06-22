"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import {
  readActiveDirectVideoCallSessionId,
  readDockedCallSessionId,
  readMinimizedCommunityCallSessionId,
  readAndroidOsPipCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";
import {
  getCallDockPresentationState,
  subscribeCallDockPresentation,
} from "@/lib/community-messenger/call-dock-presentation";
import {
  CALL_DOCK_TRANSITION_EASING,
  CALL_DOCK_TRANSITION_MS,
} from "@/lib/community-messenger/call-ui/call-dock-theme";
import { GlobalCallVideoPipHost } from "@/components/layout/providers/GlobalCallVideoPipHost";
import { GlobalCallDockHost } from "@/components/layout/providers/GlobalCallDockHost";
import { DibayCallPipBridgeHost } from "@/components/layout/providers/DibayCallPipBridgeHost";
import { pushMessengerCallMainBottomNavSuppressed } from "@/lib/layout/messenger-call-main-bottom-nav-suppress";

/** `CallScreenShell` 포털·`CallClient` dynamic import 전에도 하단 탭(z-1200)이 통화 위로 올라오지 않게 */
const CALL_HOST_FULLSCREEN_Z = "z-[1280]";

const FULLSCREEN_CROSSFADE_STYLE = {
  transition: `transform ${CALL_DOCK_TRANSITION_MS}ms ${CALL_DOCK_TRANSITION_EASING}, opacity ${CALL_DOCK_TRANSITION_MS}ms ${CALL_DOCK_TRANSITION_EASING}`,
  willChange: "transform, opacity",
} as const;

const CommunityMessengerCallClient = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/CommunityMessengerCallClient").then((m) => m.CommunityMessengerCallClient)
    ),
  { ssr: false }
);

const HOST_SYNC_EVENT = "samarket:cm-call-host-sync";

const IDLE_DOCK_PRESENTATION = {
  visualPhase: "hidden" as const,
  restoreInFlight: false,
  pendingSessionId: null,
};

export function subscribeCommunityCallHostSync(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(HOST_SYNC_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(HOST_SYNC_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function readHostedCallSessionId(): string | null {
  return (
    readDockedCallSessionId() ??
    readMinimizedCommunityCallSessionId() ??
    readActiveDirectVideoCallSessionId()
  );
}

/** CallClient 호스트 상태 변경 — minimize·join·expand·종료 시 호출 */
export function notifyCommunityCallHostSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOST_SYNC_EVENT));
}

/**
 * active·minimized direct 영상 통화 CallClient 단일 상주 (음성은 전용 `/calls` 라우트 유지).
 */
export function CommunityMessengerActiveCallHost() {
  useSyncExternalStore(subscribeCommunityCallHostSync, readHostedCallSessionId, () => null);
  const pres = useSyncExternalStore(
    subscribeCallDockPresentation,
    getCallDockPresentationState,
    () => IDLE_DOCK_PRESENTATION
  );
  const hostedSessionId = readHostedCallSessionId();
  const isDockedFlag =
    hostedSessionId != null && readDockedCallSessionId() === hostedSessionId;
  const isMinimizedFlag =
    hostedSessionId != null && readMinimizedCommunityCallSessionId() === hostedSessionId;
  const isAndroidOsPipFlag =
    hostedSessionId != null && readAndroidOsPipCallSessionId() === hostedSessionId;
  const hideFullscreenHost = (isDockedFlag || isMinimizedFlag) && !pres.restoreInFlight;
  const suppressBottomNavForFullscreenHost =
    hostedSessionId != null && (!hideFullscreenHost || isAndroidOsPipFlag);
  const dockingCrossfade =
    Boolean(pres.pendingSessionId) || pres.visualPhase === "entering" || pres.visualPhase === "exiting";

  useLayoutEffect(() => {
    if (!suppressBottomNavForFullscreenHost) return;
    return pushMessengerCallMainBottomNavSuppressed();
  }, [suppressBottomNavForFullscreenHost]);

  const fullscreenCrossfadeStyle =
    !hideFullscreenHost && dockingCrossfade
      ? pres.restoreInFlight
        ? { ...FULLSCREEN_CROSSFADE_STYLE, opacity: 1, transform: "scale(1)" }
        : { ...FULLSCREEN_CROSSFADE_STYLE, opacity: 0, transform: "scale(0.97)" }
      : undefined;

  if (!hostedSessionId) {
    return (
      <>
        <GlobalCallDockHost />
        <GlobalCallVideoPipHost />
        <DibayCallPipBridgeHost />
      </>
    );
  }

  const presentation = isAndroidOsPipFlag
    ? "android-os-pip"
    : isDockedFlag
      ? "dock"
      : isMinimizedFlag
        ? "minimized"
        : "fullscreen";

  return (
    <>
      <GlobalCallDockHost />
      <GlobalCallVideoPipHost />
      <DibayCallPipBridgeHost />
      <div
        className={
          hideFullscreenHost
            ? "fixed h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
            : `fixed inset-0 ${CALL_HOST_FULLSCREEN_Z}`
        }
        style={fullscreenCrossfadeStyle}
        aria-hidden={hideFullscreenHost ? true : undefined}
      >
        <CommunityMessengerCallClient sessionId={hostedSessionId} presentation={presentation} />
      </div>
    </>
  );
}
