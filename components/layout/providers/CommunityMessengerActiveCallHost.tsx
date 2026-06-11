"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import {
  readActiveDirectVideoCallSessionId,
  readMinimizedCommunityCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";
import { GlobalCallVideoPipHost } from "@/components/layout/providers/GlobalCallVideoPipHost";
import { pushMessengerCallMainBottomNavSuppressed } from "@/lib/layout/messenger-call-main-bottom-nav-suppress";

/** `CallScreenShell` 포털·`CallClient` dynamic import 전에도 하단 탭(z-1200)이 통화 위로 올라오지 않게 */
const CALL_HOST_FULLSCREEN_Z = "z-[1280]";

const CommunityMessengerCallClient = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/CommunityMessengerCallClient").then((m) => m.CommunityMessengerCallClient)
    ),
  { ssr: false }
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
  return readMinimizedCommunityCallSessionId() ?? readActiveDirectVideoCallSessionId();
}

/** CallClient 호스트 상태 변경 — minimize·join·expand·종료 시 호출 */
export function notifyCommunityCallHostSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOST_SYNC_EVENT));
}

/**
 * active·minimized direct 영상통화 CallClient 단일 상주.
 */
export function CommunityMessengerActiveCallHost() {
  useSyncExternalStore(subscribeCommunityCallHostSync, readHostedCallSessionId, () => null);
  const hostedSessionId = readHostedCallSessionId();
  const isMinimizedFlag =
    hostedSessionId != null && readMinimizedCommunityCallSessionId() === hostedSessionId;
  const suppressBottomNavForFullscreenHost =
    hostedSessionId != null && !isMinimizedFlag;

  useLayoutEffect(() => {
    if (!suppressBottomNavForFullscreenHost) return;
    return pushMessengerCallMainBottomNavSuppressed();
  }, [suppressBottomNavForFullscreenHost]);

  if (!hostedSessionId) {
    return <GlobalCallVideoPipHost />;
  }

  const presentation = isMinimizedFlag ? "minimized" : "fullscreen";

  return (
    <>
      <GlobalCallVideoPipHost />
      <div
        className={
          presentation === "minimized"
            ? "fixed h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
            : `fixed inset-0 ${CALL_HOST_FULLSCREEN_Z}`
        }
        aria-hidden={presentation === "minimized" ? true : undefined}
      >
        <CommunityMessengerCallClient sessionId={hostedSessionId} presentation={presentation} />
      </div>
    </>
  );
}
