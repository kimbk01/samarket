"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import {
  readActiveDirectVideoCallSessionId,
  readMinimizedCommunityCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";
import { GlobalCallVideoPipHost } from "@/components/layout/providers/GlobalCallVideoPipHost";

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

  if (!hostedSessionId) {
    return <GlobalCallVideoPipHost />;
  }

  const isMinimizedFlag = readMinimizedCommunityCallSessionId() === hostedSessionId;
  const presentation = isMinimizedFlag ? "minimized" : "fullscreen";

  return (
    <>
      <GlobalCallVideoPipHost />
      <div
        className={
          presentation === "minimized"
            ? "fixed h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
            : "fixed inset-0 z-[78]"
        }
        aria-hidden={presentation === "minimized" ? true : undefined}
      >
        <CommunityMessengerCallClient sessionId={hostedSessionId} presentation={presentation} />
      </div>
    </>
  );
}
