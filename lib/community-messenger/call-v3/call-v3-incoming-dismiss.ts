const dismissedIncomingCallIds = new Set<string>();

export function markCallV3IncomingDismissed(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  dismissedIncomingCallIds.add(sid);
}

export function isCallV3IncomingDismissed(callId: string): boolean {
  return dismissedIncomingCallIds.has(callId.trim());
}

export function resetCallV3IncomingDismissedForTests(): void {
  dismissedIncomingCallIds.clear();
}
