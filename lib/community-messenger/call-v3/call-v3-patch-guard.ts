const cancelPatchClaimed = new Set<string>();
const acceptPatchClaimed = new Set<string>();
const rejectPatchClaimed = new Set<string>();
const endPatchClaimed = new Set<string>();
const missedPatchClaimed = new Set<string>();

function claimOnce(store: Set<string>, callId: string): boolean {
  const sid = callId.trim();
  if (!sid || store.has(sid)) return false;
  store.add(sid);
  return true;
}

export function claimCallV3CancelPatchOnce(callId: string): boolean {
  return claimOnce(cancelPatchClaimed, callId);
}

export function claimCallV3AcceptPatchOnce(callId: string): boolean {
  return claimOnce(acceptPatchClaimed, callId);
}

export function claimCallV3RejectPatchOnce(callId: string): boolean {
  return claimOnce(rejectPatchClaimed, callId);
}

export function claimCallV3EndPatchOnce(callId: string): boolean {
  return claimOnce(endPatchClaimed, callId);
}

export function claimCallV3MissedPatchOnce(callId: string): boolean {
  return claimOnce(missedPatchClaimed, callId);
}

export function releaseCallV3MissedPatchClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  missedPatchClaimed.delete(sid);
}

export function releaseCallV3EndPatchClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  endPatchClaimed.delete(sid);
}

export function releaseCallV3CancelPatchClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  cancelPatchClaimed.delete(sid);
}

export function releaseCallV3RejectPatchClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  rejectPatchClaimed.delete(sid);
}

export function resetCallV3PatchClaimsForTests(): void {
  cancelPatchClaimed.clear();
  acceptPatchClaimed.clear();
  rejectPatchClaimed.clear();
  endPatchClaimed.clear();
  missedPatchClaimed.clear();
}

/** @deprecated use resetCallV3PatchClaimsForTests */
export function resetCallV3CancelPatchClaimsForTests(): void {
  resetCallV3PatchClaimsForTests();
}
