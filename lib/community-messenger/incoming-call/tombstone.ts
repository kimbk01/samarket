/**
 * 수신 통화 tombstone — 종료된 callId 재수신·재벨 단일 판정.
 * consumed(Web) + hardClear(Global ref) 를 한 API 로 묶는다.
 */
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  type CallConsumedReason,
  filterIncomingSessionsRespectingConsumed,
  filterIncomingSessionsRespectingHardClear,
  isDibayCallConsumed,
  isIncomingSessionHardCleared,
  markCallConsumed,
  markCallConsumedFromNativeHydrate,
  shouldAllowIncomingRingtone,
} from "@/lib/community-messenger/incoming-call-state";

export type { CallConsumedReason };

export function isIncomingCallTerminal(
  callId: string | null | undefined,
  hardClearedAt: Map<string, number>,
  now = Date.now()
): boolean {
  const sid = callId?.trim() ?? "";
  if (!sid) return false;
  if (isDibayCallConsumed(sid, now)) return true;
  return isIncomingSessionHardCleared(sid, hardClearedAt, now);
}

export function canIncomingCallRing(
  callId: string | null | undefined,
  hardClearedAt: Map<string, number>,
  now = Date.now()
): boolean {
  const sid = callId?.trim() ?? "";
  if (!sid) return false;
  if (isIncomingCallTerminal(sid, hardClearedAt, now)) return false;
  return shouldAllowIncomingRingtone(sid, now);
}

export function latchIncomingCallTerminal(
  callId: string | null | undefined,
  reason: CallConsumedReason,
  hardClearedAt: Map<string, number>
): string {
  const sid = callId?.trim() ?? "";
  if (!sid) return "";
  markCallConsumed(sid, reason);
  hardClearedAt.set(sid, Date.now());
  return sid;
}

export function hydrateIncomingCallTerminalFromNative(
  callId: string,
  reason: CallConsumedReason,
  hardClearedAt: Map<string, number>
): void {
  const sid = callId.trim();
  if (!sid || isDibayCallConsumed(sid)) return;
  markCallConsumedFromNativeHydrate(sid, reason);
  hardClearedAt.set(sid, Date.now());
}

export function filterIncomingSessionsAfterTerminal(
  list: CommunityMessengerCallSession[],
  hardClearedAt: Map<string, number>
): CommunityMessengerCallSession[] {
  return filterIncomingSessionsRespectingHardClear(
    filterIncomingSessionsRespectingConsumed(list),
    hardClearedAt
  );
}
