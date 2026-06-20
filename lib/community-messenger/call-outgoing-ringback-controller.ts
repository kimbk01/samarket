import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import {
  startCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
  type CallToneController,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  primeWebAudioCallToneContextFromUserGesture,
  startWebAudioCallTone,
} from "@/lib/community-messenger/call-tone-web-audio";

export type OutgoingRingbackSnapshot = {
  callId: string | null;
  startedAt: number;
  playing: boolean;
  source?: string;
  stopReason?: string;
};

export type StartOutgoingRingbackArgs = {
  callId: string;
  kind: CommunityMessengerCallKind;
  source: string;
};

export type PrimeOutgoingRingbackFromUserGestureArgs = {
  kind: CommunityMessengerCallKind;
  source: string;
};

let activeCallId: string | null = null;
let activeTone: CallToneController | null = null;
let startedAt = 0;
let activeSource: string | undefined;
let lastStopReason: string | undefined;
let startInFlightCallId: string | null = null;
let startGeneration = 0;

function logRingbackStart(callId: string, kind: CommunityMessengerCallKind, source: string): void {
  if (typeof console !== "undefined") {
    console.info("[DIBAY_CALL] ringback_start", { callId, kind, source });
  }
  logDibayCall("ring_start", { callId, kind, source, lane: "outgoing_ringback" });
}

function logRingbackStop(callId: string | null, reason: string, source?: string): void {
  if (typeof console !== "undefined") {
    console.info("[DIBAY_CALL] ringback_stop", { callId, reason, source });
  }
  if (callId) {
    logDibayCall("ring_stop", { callId, reason, source, lane: "outgoing_ringback" });
  }
}

function logRingbackPlayFailed(callId: string, error: unknown, source: string): void {
  if (typeof console !== "undefined") {
    console.warn("[DIBAY_CALL] ringback_play_failed", { callId, error, source });
  }
}

function stopOutgoingToneInternal(reason: string): void {
  activeTone?.stop();
  activeTone = null;
  activeCallId = null;
  startedAt = 0;
  activeSource = undefined;
  lastStopReason = reason;
  startInFlightCallId = null;
}

export function getOutgoingRingbackSnapshot(): OutgoingRingbackSnapshot {
  return {
    callId: activeCallId,
    startedAt,
    playing: activeTone != null,
    source: activeSource,
    stopReason: lastStopReason,
  };
}

/** 발신 버튼 tap 등 사용자 제스처 tick — await 전 Web Audio priming */
export function primeOutgoingRingbackFromUserGesture(args: PrimeOutgoingRingbackFromUserGestureArgs): void {
  if (typeof window === "undefined") return;
  stopOutgoingToneInternal("prime_replace");
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  primeWebAudioCallToneContextFromUserGesture();
  const kind: "voice" | "video" = args.kind === "video" ? "video" : "voice";
  const web = startWebAudioCallTone("outgoing", kind);
  if (!web) return;
  activeTone = { stop: () => web.stop() };
  activeSource = args.source;
  startedAt = Date.now();
  logRingbackStart("gesture-prime", args.kind, args.source);
}

export function startOutgoingRingback(args: StartOutgoingRingbackArgs): void {
  if (typeof window === "undefined") return;
  const callId = args.callId.trim();
  if (!callId) return;

  if (activeCallId === callId && activeTone) {
    logDibayCall("ring_start", { callId, kind: args.kind, source: args.source, deduped: true });
    return;
  }
  if (startInFlightCallId === callId) {
    logDibayCall("ring_start", { callId, kind: args.kind, source: args.source, deduped: "in_flight" });
    return;
  }

  if (activeCallId && activeCallId !== callId) {
    logRingbackStop(activeCallId, "replaced", args.source);
    stopOutgoingToneInternal("replaced");
  }

  startInFlightCallId = callId;
  const gen = ++startGeneration;
  void startCommunityMessengerCallTone("outgoing", { callKind: args.kind }).then(
    (tone) => {
      startInFlightCallId = null;
      if (gen !== startGeneration) {
        tone.stop();
        return;
      }
      if (activeCallId === callId && activeTone) {
        tone.stop();
        logDibayCall("ring_start", { callId, kind: args.kind, source: args.source, deduped: "race" });
        return;
      }
      activeTone?.stop();
      activeCallId = callId;
      activeTone = tone;
      startedAt = Date.now();
      activeSource = args.source;
      lastStopReason = undefined;
      logRingbackStart(callId, args.kind, args.source);
    },
    (error) => {
      startInFlightCallId = null;
      logRingbackPlayFailed(callId, error, args.source);
    }
  );
}

export function stopOutgoingRingback(callId: string | null | undefined, reason: string): void {
  const sid = callId?.trim() ?? "";
  if (sid && activeCallId && activeCallId !== sid) return;
  if (!activeTone && !activeCallId && !startInFlightCallId) return;
  startGeneration += 1;
  const stoppedId = activeCallId ?? (sid || null);
  logRingbackStop(stoppedId, reason, activeSource);
  stopOutgoingToneInternal(reason);
}

export function stopAllOutgoingRingback(reason: string): void {
  if (!activeTone && !activeCallId && !startInFlightCallId) return;
  startGeneration += 1;
  logRingbackStop(activeCallId, reason, activeSource);
  stopOutgoingToneInternal(reason);
}

/** 테스트·세션 리셋 */
export function resetOutgoingRingbackControllerForTests(): void {
  startGeneration += 1;
  stopOutgoingToneInternal("test_reset");
}
