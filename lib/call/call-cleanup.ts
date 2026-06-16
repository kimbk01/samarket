"use client";

import { stopCommunityMessengerCallFeedback, stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { runCommunityMessengerCallMediaCleanup } from "@/lib/community-messenger/community-messenger-call-media-cleanup";
import { callAgoraLeave } from "@/lib/call/call-agora";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";

/** media·tone·notification만 정리 — status 변경 금지 */
export async function runCallMediaCleanup(reason: string, sessionId?: string | null): Promise<void> {
  stopCommunityMessengerCallTone();
  stopCommunityMessengerCallFeedback();
  if (sessionId?.trim()) {
    requestCloseMessengerCallNotifications(sessionId.trim());
  }
  await callAgoraLeave();
  await runCommunityMessengerCallMediaCleanup({
    reason: `call_runtime:${reason}`,
    client: null,
    tracks: null,
    domAudioNuclear: true,
  });
}
