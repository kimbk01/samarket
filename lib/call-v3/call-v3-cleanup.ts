"use client";

import { stopCommunityMessengerCallFeedback, stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { runCommunityMessengerCallMediaCleanup } from "@/lib/community-messenger/community-messenger-call-media-cleanup";
import { callV3AgoraLeave } from "@/lib/call-v3/call-v3-agora";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";

/** media·tone·notification만 정리 — status 변경 금지 */
export async function runCallV3MediaCleanup(reason: string, sessionId?: string | null): Promise<void> {
  stopCommunityMessengerCallTone();
  stopCommunityMessengerCallFeedback();
  if (sessionId?.trim()) {
    requestCloseMessengerCallNotifications(sessionId.trim());
  }
  await callV3AgoraLeave();
  await runCommunityMessengerCallMediaCleanup({
    reason: `call_v3:${reason}`,
    client: null,
    tracks: null,
    domAudioNuclear: true,
  });
}
