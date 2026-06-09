"use client";

import { getCommunityMessengerCallRuntime } from "@/lib/community-messenger/call-runtime-registry";
import { forceReleaseAllIncomingCallRealtimeSubscriptions } from "@/lib/community-messenger/realtime/cm-incoming-call-realtime-holder";
import { stopCommunityMessengerCallFeedback, stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { useCallStore } from "@/lib/community-messenger/stores/useCallStore";

/**
 * 로그아웃·계정 전환 직전 — 진행 중 통화 미디어·Realtime·세션 PATCH 정리.
 */
export async function teardownCommunityMessengerCallOnAuthExit(reason: "logout" | "account_switch"): Promise<void> {
  stopCommunityMessengerCallTone();
  stopCommunityMessengerCallFeedback();

  const handle = getCommunityMessengerCallRuntime();
  if (handle) {
    try {
      await handle.patchTerminalBestEffort(reason);
    } catch {
      /* best-effort */
    }
    try {
      await handle.cleanupMedia();
    } catch {
      /* best-effort */
    }
  }

  forceReleaseAllIncomingCallRealtimeSubscriptions();

  try {
    useCallStore.getState().resetCall();
  } catch {
    /* ignore */
  }
}
