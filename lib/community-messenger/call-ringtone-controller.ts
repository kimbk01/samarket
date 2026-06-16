import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
  type CallToneController,
} from "@/lib/community-messenger/call-feedback-sound";
import { logCallFlow } from "@/lib/community-messenger/call-flow-log";
import { shouldAllowIncomingRingtone } from "@/lib/community-messenger/incoming-call-state";

type RingtoneMode = "incoming" | "outgoing";

let activeSessionId: string | null = null;
let activeMode: RingtoneMode | null = null;
let activeTone: CallToneController | null = null;
let incomingStartInFlight: string | null = null;
/** stop 이후 늦게 도착한 startCommunityMessengerCallTone Promise 가 벨을 다시 켜지지 않게 함 */
let incomingPlayGeneration = 0;

export function getActiveIncomingRingtoneSessionId(): string | null {
  return activeMode === "incoming" ? activeSessionId : null;
}

/** callee 가 수신 벨 화면(`/calls/:id`)으로 이동할 때 동일 세션 벨을 끊지 않는다 */
export function shouldPreserveIncomingRingtoneOnCallRoute(sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  if (incomingStartInFlight === sid) return true;
  return activeMode === "incoming" && activeSessionId === sid && activeTone != null;
}

/**
 * 수신 벨 — 동일 sessionId 중복 play 금지.
 */
export function playIncomingCallRingtone(sessionId: string, callKind: CommunityMessengerCallKind): void {
  if (typeof window === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;

  if (activeMode === "incoming" && activeSessionId === sid && activeTone) {
    logCallFlow("call_incoming_deduped", { sessionId: sid, kind: "ringtone_active" });
    return;
  }
  if (incomingStartInFlight === sid) {
    logCallFlow("call_incoming_deduped", { sessionId: sid, kind: "ringtone_start_in_flight" });
    return;
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  incomingStartInFlight = sid;
  const playGen = incomingPlayGeneration;
  void startCommunityMessengerCallTone("incoming", { callKind }).then((tone) => {
    incomingStartInFlight = null;
    if (playGen !== incomingPlayGeneration) {
      tone.stop();
      logCallFlow("call_ringtone_aborted", { sessionId: sid, kind: "stale_generation" });
      return;
    }
    if (!shouldAllowIncomingRingtone(sid)) {
      tone.stop();
      logCallFlow("call_ringtone_aborted", { sessionId: sid, kind: "consumed" });
      return;
    }
    if (activeMode === "incoming" && activeSessionId === sid && activeTone) {
      tone.stop();
      logCallFlow("call_incoming_deduped", { sessionId: sid, kind: "ringtone_race" });
      return;
    }
    stopCallRingtoneInternal("incoming_replace");
    activeSessionId = sid;
    activeMode = "incoming";
    activeTone = tone;
    logCallFlow("call_ringtone_start", { sessionId: sid, callKind, mode: "incoming" });
  });
}

/** 발신 링백 — CallClient 전용. incoming 과 교체 시에만 stop 로그. */
export async function playOutgoingCallRingtone(
  sessionId: string,
  callKind: CommunityMessengerCallKind
): Promise<CallToneController> {
  stopCallRingtoneInternal("outgoing_replace");
  const tone = await startCommunityMessengerCallTone("outgoing", { callKind });
  activeSessionId = sessionId.trim() || null;
  activeMode = "outgoing";
  activeTone = tone;
  return tone;
}

export function stopCallRingtone(reason: string, sessionId?: string | null): void {
  const sid = sessionId?.trim() ?? null;
  if (sid && activeSessionId && activeSessionId !== sid && activeMode === "incoming") {
    return;
  }
  incomingPlayGeneration += 1;
  if (!activeTone && !activeSessionId && !incomingStartInFlight) return;
  logCallFlow("call_ringtone_stop", {
    sessionId: activeSessionId ?? sid ?? undefined,
    mode: activeMode ?? undefined,
    reason,
  });
  stopCallRingtoneInternal(reason);
}

function stopCallRingtoneInternal(_reason: string): void {
  activeTone?.stop();
  activeTone = null;
  activeSessionId = null;
  activeMode = null;
  incomingStartInFlight = null;
  stopCommunityMessengerCallTone();
}
