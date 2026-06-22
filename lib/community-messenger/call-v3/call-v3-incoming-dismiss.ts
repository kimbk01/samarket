const dismissedIncomingCallIds = new Set<string>();

export function markCallV3IncomingDismissed(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  dismissedIncomingCallIds.add(sid);
}

export function isCallV3IncomingDismissed(callId: string): boolean {
  return dismissedIncomingCallIds.has(callId.trim());
}

/** reject PATCH 실패 시 discovery 가 다시 띄울 수 있도록 해제 */
export function releaseCallV3IncomingDismissed(callId: string): void {
  dismissedIncomingCallIds.delete(callId.trim());
}

export function resetCallV3IncomingDismissedForTests(): void {
  dismissedIncomingCallIds.clear();
}
