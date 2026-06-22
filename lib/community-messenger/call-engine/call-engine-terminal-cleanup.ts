"use client";

import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import { releaseCallActionLock } from "@/lib/call/call-action-lock";
import { logCallButtonState } from "@/lib/community-messenger/call-engine/call-engine-audit-log";
import { clearCallEngineLocks } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { clearNativeIncomingSurface } from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import {
  stopCallEngineIncomingRingtone,
  stopCallEngineOutgoingRingback,
} from "@/lib/community-messenger/call-engine/call-engine-ringtone-owner";

/** Terminal PATCH 성공 후 클라이언트 잔류 상태 단일 해제 */
export async function releaseCallEngineTerminalLocalState(
  callId: string,
  reason = "terminal",
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  stopCallEngineIncomingRingtone(sid, reason);
  stopCallEngineOutgoingRingback(sid, reason);
  clearCallEngineLocks(sid);
  clearNativeIncomingSurface(sid);
  releaseCallActionLock(reason);
  await hardClearActiveCallSession(sid, reason);
  logCallButtonState({ peerId: sid });
}
