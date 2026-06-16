/**
 * 전역 수신 배너 · CallClient · deep link accept/reject 가 동시에 PATCH 하지 않도록 single-flight.
 */

const acceptInFlight = new Set<string>();
const rejectInFlight = new Set<string>();

function sid(sessionId: string): string {
  return sessionId.trim();
}

export function tryClaimIncomingCallAccept(sessionId: string): boolean {
  const id = sid(sessionId);
  if (!id || acceptInFlight.has(id) || rejectInFlight.has(id)) return false;
  acceptInFlight.add(id);
  return true;
}

export function releaseIncomingCallAccept(sessionId: string): void {
  const id = sid(sessionId);
  if (!id) return;
  acceptInFlight.delete(id);
}

export function isIncomingCallAcceptInFlight(sessionId: string): boolean {
  return acceptInFlight.has(sid(sessionId));
}

export function isIncomingCallRejectInFlight(sessionId: string): boolean {
  return rejectInFlight.has(sid(sessionId));
}

export function tryClaimIncomingCallReject(sessionId: string): boolean {
  const id = sid(sessionId);
  if (!id || acceptInFlight.has(id) || rejectInFlight.has(id)) return false;
  rejectInFlight.add(id);
  return true;
}

export function releaseIncomingCallReject(sessionId: string): void {
  const id = sid(sessionId);
  if (!id) return;
  rejectInFlight.delete(id);
}

export function resetIncomingCallActionGuards(sessionId?: string): void {
  if (sessionId) {
    const id = sid(sessionId);
    acceptInFlight.delete(id);
    rejectInFlight.delete(id);
    return;
  }
  acceptInFlight.clear();
  rejectInFlight.clear();
}
