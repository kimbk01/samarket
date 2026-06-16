/**
 * 전역 수신 배너 · CallClient · deep link accept/reject 가 동시에 PATCH 하지 않도록 single-flight.
 * 구현은 call-orchestrator 한 곳에만 둔다 (이 파일은 얇은 래퍼).
 */

import {
  endDibayCallAction,
  isDibayCallActionInFlight,
  resetDibayCallActionFlights,
  tryBeginDibayCallAction,
} from "@/lib/community-messenger/call-orchestrator";

export function tryClaimIncomingCallAccept(sessionId: string): boolean {
  return tryBeginDibayCallAction(sessionId, "accept");
}

export function releaseIncomingCallAccept(sessionId: string): void {
  endDibayCallAction(sessionId, "accept");
}

export function isIncomingCallAcceptInFlight(sessionId: string): boolean {
  return isDibayCallActionInFlight(sessionId, "accept");
}

export function isIncomingCallRejectInFlight(sessionId: string): boolean {
  return isDibayCallActionInFlight(sessionId, "reject");
}

export function tryClaimIncomingCallReject(sessionId: string): boolean {
  return tryBeginDibayCallAction(sessionId, "reject");
}

export function releaseIncomingCallReject(sessionId: string): void {
  endDibayCallAction(sessionId, "reject");
}

export function resetIncomingCallActionGuards(sessionId?: string): void {
  resetDibayCallActionFlights(sessionId);
}
