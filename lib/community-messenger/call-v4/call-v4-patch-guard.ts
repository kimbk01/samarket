const acceptPatchClaimed = new Set<string>();
const rejectPatchClaimed = new Set<string>();
const endPatchClaimed = new Set<string>();

function claimOnce(store: Set<string>, callId: string): boolean {
  const sid = callId.trim();
  if (!sid || store.has(sid)) return false;
  store.add(sid);
  return true;
}

export function claimCallV4AcceptPatchOnce(callId: string): boolean {
  return claimOnce(acceptPatchClaimed, callId);
}

export function claimCallV4RejectPatchOnce(callId: string): boolean {
  return claimOnce(rejectPatchClaimed, callId);
}

export function claimCallV4EndPatchOnce(callId: string): boolean {
  return claimOnce(endPatchClaimed, callId);
}

export function resetCallV4PatchClaimsForTests(): void {
  acceptPatchClaimed.clear();
  rejectPatchClaimed.clear();
  endPatchClaimed.clear();
}
