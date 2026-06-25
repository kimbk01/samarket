import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

const acceptPatchClaimed = new Set<string>();
const acceptPatchDone = new Set<string>();
const acceptFlightClaimed = new Set<string>();
const rejectPatchClaimed = new Set<string>();
const endPatchClaimed = new Set<string>();
const cancelPatchClaimed = new Set<string>();

function claimOnce(store: Set<string>, callId: string): boolean {
  const sid = callId.trim();
  if (!sid || store.has(sid)) return false;
  store.add(sid);
  return true;
}

export function hasCallV4AcceptPatchDone(callId: string): boolean {
  const sid = callId.trim();
  return Boolean(sid && acceptPatchDone.has(sid));
}

export function markCallV4AcceptPatchDone(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  acceptPatchDone.add(sid);
}

export function releaseCallV4AcceptPatchClaim(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid || !acceptPatchClaimed.has(sid)) return;
  acceptPatchClaimed.delete(sid);
  logCallV4("call_v4_accept_patch_blocked", {
    callId: sid,
    reason: reason.trim() || "accept_patch_claim_released",
  });
}

export function resetCallV4AcceptPatchStateForCallId(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  acceptPatchClaimed.delete(sid);
  acceptPatchDone.delete(sid);
  acceptFlightClaimed.delete(sid);
}

export function tryClaimCallV4AcceptFlight(callId: string): boolean {
  const sid = callId.trim();
  if (!sid || acceptFlightClaimed.has(sid) || acceptPatchDone.has(sid)) return false;
  acceptFlightClaimed.add(sid);
  return true;
}

export function releaseCallV4AcceptFlightClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  acceptFlightClaimed.delete(sid);
}

export function claimCallV4AcceptPatchOnce(callId: string): boolean {
  const sid = callId.trim();
  if (!sid || acceptPatchClaimed.has(sid) || acceptPatchDone.has(sid)) {
    if (sid) {
      logCallV4("accept_once_skip_duplicate", { callId: sid });
      logCallV4("call_v4_accept_patch_blocked", {
        callId: sid,
        reason: acceptPatchDone.has(sid)
          ? "accept_patch_already_done"
          : acceptPatchClaimed.has(sid)
            ? "accept_patch_inflight_or_done"
            : "empty_call_id",
      });
    }
    return false;
  }
  acceptPatchClaimed.add(sid);
  return true;
}

export function claimCallV4RejectPatchOnce(callId: string): boolean {
  return claimOnce(rejectPatchClaimed, callId);
}

export function claimCallV4EndPatchOnce(callId: string): boolean {
  return claimOnce(endPatchClaimed, callId);
}

export function claimCallV4CancelPatchOnce(callId: string): boolean {
  return claimOnce(cancelPatchClaimed, callId);
}

export function releaseCallV4CancelPatchClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  cancelPatchClaimed.delete(sid);
}

export function resetCallV4PatchClaimsForTests(): void {
  acceptPatchClaimed.clear();
  acceptPatchDone.clear();
  acceptFlightClaimed.clear();
  rejectPatchClaimed.clear();
  endPatchClaimed.clear();
  cancelPatchClaimed.clear();
}
