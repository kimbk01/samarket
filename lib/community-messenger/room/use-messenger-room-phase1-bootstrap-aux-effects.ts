"use client";

import { useEffect, type MutableRefObject } from "react";
import { flushMessengerMonitorQueue } from "@/lib/community-messenger/monitoring/client";

/** `roomId` 전환·언마운트 시 사일런트 부트스트랩 스로틀 타이머 정리. Phase1 effect 본문·deps 그대로. */
export function useMessengerRoomPhase1SilentBootstrapThrottleCleanup({
  roomId,
  silentBootstrapThrottleCoalesceTimerRef,
}: {
  roomId: string;
  silentBootstrapThrottleCoalesceTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}): void {
  useEffect(() => {
    return () => {
      const t = silentBootstrapThrottleCoalesceTimerRef.current;
      if (t != null) {
        clearTimeout(t);
        silentBootstrapThrottleCoalesceTimerRef.current = null;
      }
    };
  }, [roomId]);
}

/** `snapshot.viewerUserId` 확정 시 부트스트랩 중복 요청 방지 ref 동기화. Phase1 effect 본문·deps 그대로. */
export function useMessengerRoomPhase1ViewerBootstrapDedupSync({
  snapshotViewerUserId,
  viewerBootstrapDedupRef,
}: {
  snapshotViewerUserId: string | undefined;
  viewerBootstrapDedupRef: MutableRefObject<string>;
}): void {
  useEffect(() => {
    const v = snapshotViewerUserId?.trim() ?? "";
    if (v) viewerBootstrapDedupRef.current = v;
  }, [snapshotViewerUserId]);
}

/** 방 언마운트 시 모니터 큐 플러시. Phase1 effect 본문·deps 그대로. */
export function useMessengerRoomPhase1MonitorFlushOnRoomUnmount({ roomId }: { roomId: string }): void {
  useEffect(() => {
    return () => {
      void flushMessengerMonitorQueue();
    };
  }, [roomId]);
}
