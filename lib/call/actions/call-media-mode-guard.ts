"use client";

import {
  patchCommunityMessengerCallSession,
  type CommunityMessengerCallSessionPatchDebugContext,
} from "@/lib/call/call-actions";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

export type CallMediaModeAction = "upgrade_to_video" | "downgrade_to_voice";

/** Media-mode PATCH gateway — CallClient 는 media/UI 만 소유하고 서버 PATCH 는 이 guard 로 위임한다. */
export async function runCallMediaModeGuard(
  sessionId: string,
  action: CallMediaModeAction,
  context?: CommunityMessengerCallSessionPatchDebugContext,
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  return patchCommunityMessengerCallSession(sessionId, action, undefined, context);
}
