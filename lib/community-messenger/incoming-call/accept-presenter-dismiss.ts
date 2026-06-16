"use client";

/**
 * Accept 성공 후 Global incoming presenter 정리 — terminal seal 아님.
 * Consumed tombstone은 gateway `applyIncomingCallConsumedSideEffects` 가 담당.
 * See docs/community-messenger/incoming-call-ssot.md (Phase9/10)
 */
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";

export function markIncomingCallHardClearedSession(
  hardClearedAtBySessionId: Map<string, number>,
  sessionId: string
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  console.info("[call-flow] incoming_hard_clear_marked", {
    sessionId: sid,
    callId: sid,
    roomId: null,
    reason: "hard_clear",
  });
  hardClearedAtBySessionId.set(sid, Date.now());
}

export type DismissIncomingPresenterAfterAcceptArgs = {
  sessionId: string;
  dismissedAt: Map<string, number>;
  hardClearedAt: Map<string, number>;
  activeIncomingCallIds: Set<string>;
  suppressMissedSound: Set<string>;
  /** Group accept only — 1:1 gateway already stops ring before this runs. */
  ringStopSource?: string;
  removeSessionFromIncomingList: (sessionId: string) => void;
};

/** Presenter/merge race guard after successful accept — not terminal latch. */
export function dismissIncomingPresenterAfterAccept(args: DismissIncomingPresenterAfterAcceptArgs): void {
  const sid = args.sessionId.trim();
  if (!sid) return;
  args.dismissedAt.set(sid, Date.now());
  args.removeSessionFromIncomingList(sid);
  if (args.ringStopSource) {
    dibayIncomingLaneStopRing(args.ringStopSource, sid);
  }
  args.activeIncomingCallIds.delete(sid);
  markIncomingCallHardClearedSession(args.hardClearedAt, sid);
  args.suppressMissedSound.add(sid);
}
