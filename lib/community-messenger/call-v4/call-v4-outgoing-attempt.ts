/**
 * CUT-5C — local outgoing attempt identity (NOT session.id / callId / DB id).
 * Generation gate for PREPARING → BOUND vs ABANDONED late-create cancel.
 */

export type CallV4OutgoingAttemptState = "ACTIVE" | "ABANDONED" | "BOUND" | "FAILED";

export type CallV4OutgoingAttempt = {
  attemptId: string;
  state: CallV4OutgoingAttemptState;
  mediaType: "audio" | "video";
  roomId: string | null;
  peerUserId: string | null;
  peerLabel: string | null;
  boundSessionId: string | null;
  createdAtMs: number;
};

let currentAttempt: CallV4OutgoingAttempt | null = null;

function newAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function resetCallV4OutgoingAttemptForTests(): void {
  currentAttempt = null;
}

export function readCallV4OutgoingAttempt(): CallV4OutgoingAttempt | null {
  return currentAttempt;
}

export function createCallV4OutgoingAttempt(input: {
  mediaType: "audio" | "video";
  roomId?: string | null;
  peerUserId?: string | null;
  peerLabel?: string | null;
}): CallV4OutgoingAttempt {
  const attempt: CallV4OutgoingAttempt = {
    attemptId: newAttemptId(),
    state: "ACTIVE",
    mediaType: input.mediaType,
    roomId: input.roomId?.trim() || null,
    peerUserId: input.peerUserId?.trim() || null,
    peerLabel: input.peerLabel?.trim() || null,
    boundSessionId: null,
    createdAtMs: Date.now(),
  };
  currentAttempt = attempt;
  return attempt;
}

/** Immediate local abandon — create fetch must keep running. */
export function abandonCallV4OutgoingAttempt(attemptId: string): boolean {
  const id = attemptId.trim();
  if (!id || !currentAttempt || currentAttempt.attemptId !== id) return false;
  if (currentAttempt.state !== "ACTIVE") return false;
  currentAttempt = { ...currentAttempt, state: "ABANDONED" };
  return true;
}

export function failCallV4OutgoingAttempt(attemptId: string): boolean {
  const id = attemptId.trim();
  if (!id || !currentAttempt || currentAttempt.attemptId !== id) return false;
  if (currentAttempt.state !== "ACTIVE" && currentAttempt.state !== "ABANDONED") return false;
  currentAttempt = { ...currentAttempt, state: "FAILED" };
  return true;
}

export function bindCallV4OutgoingAttempt(attemptId: string, sessionId: string): boolean {
  const id = attemptId.trim();
  const sid = sessionId.trim();
  if (!id || !sid || !currentAttempt || currentAttempt.attemptId !== id) return false;
  if (currentAttempt.state !== "ACTIVE") return false;
  currentAttempt = {
    ...currentAttempt,
    state: "BOUND",
    boundSessionId: sid,
  };
  return true;
}

/**
 * INVARIANT A — only ACTIVE + matching attemptId may BIND / start post-session native.
 */
export function isCallV4OutgoingAttemptBindable(attemptId: string): boolean {
  const id = attemptId.trim();
  if (!id || !currentAttempt) return false;
  return currentAttempt.attemptId === id && currentAttempt.state === "ACTIVE";
}

export function isCallV4OutgoingAttemptAbandoned(attemptId: string): boolean {
  const id = attemptId.trim();
  if (!id || !currentAttempt) return false;
  return currentAttempt.attemptId === id && currentAttempt.state === "ABANDONED";
}

export function clearCallV4OutgoingAttemptIf(attemptId: string): void {
  const id = attemptId.trim();
  if (!id || !currentAttempt || currentAttempt.attemptId !== id) return;
  currentAttempt = null;
}
