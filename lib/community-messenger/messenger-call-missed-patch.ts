"use client";

import type { CommunityMessengerCallSessionPatchDebugContext } from "@/lib/community-messenger/call-http-actions";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { dispatchCallEngineSignal } from "@/lib/community-messenger/call-engine/call-engine-controller";

const inFlightBySessionId = new Map<string, Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }>>();
const missedTombstoneUntilMs = new Map<string, number>();
const MISSED_TOMBSTONE_MS = 120_000;

function isMissedTombstoned(sessionId: string): boolean {
  const until = missedTombstoneUntilMs.get(sessionId) ?? 0;
  if (until <= Date.now()) {
    if (until > 0) missedTombstoneUntilMs.delete(sessionId);
    return false;
  }
  return true;
}

function markMissedTombstone(sessionId: string): void {
  missedTombstoneUntilMs.set(sessionId, Date.now() + MISSED_TOMBSTONE_MS);
}

/** 링 타임아웃 missed — CallEngine controller 단일 경로 */
export async function patchCommunityMessengerCallMissedOnce(
  sessionId: string,
  debugContext?: CommunityMessengerCallSessionPatchDebugContext,
): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string; skipped?: boolean }> {
  const sid = sessionId.trim();
  if (!sid) return { ok: false, error: "session_required" };
  if (isMissedTombstoned(sid)) return { ok: true, skipped: true };

  const existing = inFlightBySessionId.get(sid);
  if (existing) return existing.then((r) => ({ ...r, skipped: true }));

  const run = dispatchCallEngineSignal({
    type: "user_missed",
    callId: sid,
    debugContext,
    source: "missed_patch_once",
  }).then((res) => {
    if (res.ok) markMissedTombstone(sid);
    return res;
  });

  inFlightBySessionId.set(sid, run);
  try {
    return await run;
  } finally {
    if (inFlightBySessionId.get(sid) === run) {
      inFlightBySessionId.delete(sid);
    }
  }
}
