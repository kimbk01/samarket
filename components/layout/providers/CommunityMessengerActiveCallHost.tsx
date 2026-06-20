"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import {
  clearAllCommunityCallLocalSessionFlags,
  isTerminalSuppressedPresentation,
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  readPipMinimizedCallSessionId,
  resolveHostedCallPresentation,
} from "@/lib/community-messenger/call-presentation-ownership";
import { GlobalCallVideoPipHost } from "@/components/layout/providers/GlobalCallVideoPipHost";
import { pushMessengerCallMainBottomNavSuppressed } from "@/lib/layout/messenger-call-main-bottom-nav-suppress";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { getCommunityMessengerCallRuntime, resetCommunityMessengerCallRuntimeSurface } from "@/lib/community-messenger/call-runtime-registry";
import { isTerminalStatusForCleanup } from "@/lib/community-messenger/call-terminal-cleanup";

/** `CallScreenShell` 포털·`CallClient` dynamic import 전에도 하단 탭(z-1200)이 통화 위로 올라오지 않게 */
const CALL_HOST_FULLSCREEN_Z = "z-[1280]";

const CommunityMessengerCallClient = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/CommunityMessengerCallClient").then((m) => m.CommunityMessengerCallClient)
    ),
  {
    ssr: false,
    loading: () => <CommunityMessengerCallRouteLoading />,
  }
);

const HOST_SYNC_EVENT = "samarket:cm-call-host-sync";

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
  return readDockedCallSessionId() ?? readPipMinimizedCallSessionId() ?? readHostedActiveCallSessionId();
}

/** CallClient 호스트 상태 변경 — minimize·join·expand·종료 시 호출 */
export function notifyCommunityCallHostSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOST_SYNC_EVENT));
}

/** active direct 통화(voice/video) CallClient 단일 상주. */
export function CommunityMessengerActiveCallHost() {
  useSyncExternalStore(subscribeCommunityCallHostSync, readHostedCallSessionId, () => null);
  const hostedSessionId = readHostedCallSessionId();
  const runtime = getCommunityMessengerCallRuntime();
  const hostedPresentation =
    hostedSessionId != null ? resolveHostedCallPresentation(hostedSessionId) : null;
  const suppressBottomNavForFullscreenHost = hostedSessionId != null && hostedPresentation === "fullscreen";

  useEffect(() => {
    if (!hostedSessionId) return;
    const runtimeSessionId = runtime?.sessionId?.trim() ?? "";
    const runtimeStatus = runtime?.session?.status ?? null;
    const shouldDropOwnership =
      isTerminalSuppressedPresentation(hostedSessionId) ||
      !runtimeSessionId ||
      runtimeSessionId !== hostedSessionId ||
      isTerminalStatusForCleanup(runtimeStatus);
    if (!shouldDropOwnership) return;
    clearAllCommunityCallLocalSessionFlags();
    resetCommunityMessengerCallRuntimeSurface();
    notifyCommunityCallHostSync();
  }, [hostedSessionId, runtime?.session?.status, runtime?.sessionId]);

  useLayoutEffect(() => {
    if (!suppressBottomNavForFullscreenHost) return;
    return pushMessengerCallMainBottomNavSuppressed();
  }, [suppressBottomNavForFullscreenHost]);

  if (!hostedSessionId) {
    return <GlobalCallVideoPipHost />;
  }

  const presentation = hostedPresentation ?? "fullscreen";
  const callClientPresentation: "fullscreen" | "minimized" =
    presentation === "fullscreen" ? "fullscreen" : "minimized";

  return (
    <>
      <GlobalCallVideoPipHost />
      <div
        className={
          presentation === "pip-minimized" || presentation === "dock"
            ? "fixed h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
            : `fixed inset-0 ${CALL_HOST_FULLSCREEN_Z} bg-[#003D29]`
        }
        aria-hidden={presentation === "pip-minimized" || presentation === "dock" ? true : undefined}
      >
        <CommunityMessengerCallClient sessionId={hostedSessionId} presentation={callClientPresentation} />
      </div>
    </>
  );
}
