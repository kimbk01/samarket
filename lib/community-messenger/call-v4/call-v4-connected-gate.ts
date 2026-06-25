import type { CallV4MediaType, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

/** SSOT — connected 인정 prerequisite (Phase 1/2 video publish/attach 경로와 분리). */
export type CallV4ConnectedGateInput = {
  callId: string;
  identityCallId: string | null;
  mediaType: CallV4MediaType | null;
  storePhase: CallV4Phase;
  sessionStatus: string | null;
  acceptPatchJoinableInflight: boolean;
  agoraJoinSuccess: boolean;
  remoteAudioSubscribed: boolean;
  localVideoPublishDone: boolean;
  direction: "incoming" | "outgoing" | null;
};

export type CallV4ConnectedGateFailureReason =
  | "identity_mismatch"
  | "session_not_joinable"
  | "agora_join_not_ready"
  | "audio_media_not_ready"
  | "video_local_publish_not_ready"
  | "phase_not_eligible";

export type CallV4ConnectedGateResult =
  | { pass: true }
  | { pass: false; reason: CallV4ConnectedGateFailureReason };

const JOINABLE_INFLIGHT_PHASES = new Set<CallV4Phase>(["accepting", "joining"]);
const PROMOTABLE_PHASES = new Set<CallV4Phase>([
  "creating",
  "outgoing_ringing",
  "incoming_ringing",
  "accepting",
  "joining",
]);

const acceptPatchJoinableInflight = new Set<string>();
const calleeScreenHydrateInflight = new Set<string>();

export function markCallV4AcceptPatchJoinableInflight(callId: string): void {
  const sid = callId.trim();
  if (sid) acceptPatchJoinableInflight.add(sid);
}

export function clearCallV4AcceptPatchJoinableInflight(callId: string): void {
  acceptPatchJoinableInflight.delete(callId.trim());
}

export function isCallV4AcceptPatchJoinableInflight(callId: string): boolean {
  return acceptPatchJoinableInflight.has(callId.trim());
}

export function beginCallV4CalleeScreenHydrate(callId: string): void {
  const sid = callId.trim();
  if (sid) calleeScreenHydrateInflight.add(sid);
}

export function endCallV4CalleeScreenHydrate(callId: string): void {
  calleeScreenHydrateInflight.delete(callId.trim());
}

export function isCallV4CalleeScreenHydrateInflight(callId: string): boolean {
  return calleeScreenHydrateInflight.has(callId.trim());
}

function normalizeSessionStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** session active 또는 accept PATCH 직후 joinable in-flight. */
export function isCallV4SessionGateSatisfied(input: {
  sessionStatus: string | null;
  acceptPatchJoinableInflight: boolean;
  storePhase: CallV4Phase;
  direction: "incoming" | "outgoing" | null;
}): boolean {
  const status = normalizeSessionStatus(input.sessionStatus);
  if (status === "active") return true;
  if (input.acceptPatchJoinableInflight && JOINABLE_INFLIGHT_PHASES.has(input.storePhase)) {
    return status === "ringing" || status === "active" || status === "";
  }
  // Caller: callee accept 후 poll이 active를 확인한 뒤 joining으로 전환.
  if (input.direction === "outgoing" && input.storePhase === "joining") return true;
  return false;
}

/** remote video는 UI readiness — gate hard requirement 아님. */
export function isCallV4ConnectedMediaPrerequisiteMet(input: {
  mediaType: CallV4MediaType | null;
  agoraJoinSuccess: boolean;
  remoteAudioSubscribed: boolean;
  localVideoPublishDone: boolean;
}): boolean {
  if (!input.agoraJoinSuccess) return false;
  if (input.mediaType === "video") {
    return input.localVideoPublishDone;
  }
  if (input.mediaType === "audio") {
    return input.agoraJoinSuccess || input.remoteAudioSubscribed;
  }
  return false;
}

export function evaluateCallV4ConnectedGate(input: CallV4ConnectedGateInput): CallV4ConnectedGateResult {
  const sid = input.callId.trim();
  if (!sid || input.identityCallId !== sid) {
    return { pass: false, reason: "identity_mismatch" };
  }

  if (input.storePhase === "ending" || input.storePhase === "idle" || input.storePhase === "connected") {
    if (input.storePhase === "connected") return { pass: true };
    return { pass: false, reason: "phase_not_eligible" };
  }

  if (!PROMOTABLE_PHASES.has(input.storePhase)) {
    return { pass: false, reason: "phase_not_eligible" };
  }

  if (
    !isCallV4SessionGateSatisfied({
      sessionStatus: input.sessionStatus,
      acceptPatchJoinableInflight: input.acceptPatchJoinableInflight,
      storePhase: input.storePhase,
      direction: input.direction,
    })
  ) {
    return { pass: false, reason: "session_not_joinable" };
  }

  if (!input.agoraJoinSuccess) {
    return { pass: false, reason: "agora_join_not_ready" };
  }

  if (!isCallV4ConnectedMediaPrerequisiteMet(input)) {
    if (input.mediaType === "video") {
      return { pass: false, reason: "video_local_publish_not_ready" };
    }
    return { pass: false, reason: "audio_media_not_ready" };
  }

  return { pass: true };
}

/** stale-route: hydrate in-flight 중 exit 금지. */
export function shouldSuppressCallV4StaleRouteExit(input: {
  routeCallId: string;
  hydrateInflight: boolean;
  afterIdentityCallId: string | null;
  afterPhase: CallV4Phase;
  activePhases: ReadonlySet<CallV4Phase>;
}): boolean {
  if (input.hydrateInflight) return true;
  if (input.afterIdentityCallId === input.routeCallId && input.activePhases.has(input.afterPhase)) {
    return true;
  }
  return false;
}

export type CallV4ConnectedGateAgoraSignals = {
  sessionStatus: string | null;
  agoraJoinSuccess: boolean;
  remoteAudioSubscribed: boolean;
  localVideoPublishDone: boolean;
};

const defaultAgoraSignals = (): CallV4ConnectedGateAgoraSignals => ({
  sessionStatus: null,
  agoraJoinSuccess: false,
  remoteAudioSubscribed: false,
  localVideoPublishDone: false,
});

const agoraSignalsByCallId = new Map<string, CallV4ConnectedGateAgoraSignals>();

export function writeCallV4ConnectedGateAgoraSignals(
  callId: string,
  patch: Partial<CallV4ConnectedGateAgoraSignals>,
): void {
  const sid = callId.trim();
  if (!sid) return;
  const prev = agoraSignalsByCallId.get(sid) ?? defaultAgoraSignals();
  agoraSignalsByCallId.set(sid, { ...prev, ...patch });
}

export function readCallV4ConnectedGateAgoraSignals(callId: string): CallV4ConnectedGateAgoraSignals {
  return agoraSignalsByCallId.get(callId.trim()) ?? defaultAgoraSignals();
}

export function clearCallV4ConnectedGateAgoraSignals(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  agoraSignalsByCallId.delete(sid);
  acceptPatchJoinableInflight.delete(sid);
}

export function resetCallV4ConnectedGateForTests(): void {
  acceptPatchJoinableInflight.clear();
  calleeScreenHydrateInflight.clear();
  agoraSignalsByCallId.clear();
}
