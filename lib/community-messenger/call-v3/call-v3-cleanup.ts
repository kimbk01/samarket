import { stopCallV3CallerActivePoll } from "@/lib/community-messenger/call-v3/call-v3-caller-active";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { clearCallV3MissedTimer } from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { clearCallV3NativePendingForCall } from "@/lib/community-messenger/call-v3/call-v3-native-bridge";
import { stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";
import { markCallV3IncomingDismissed } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CallV3TerminalPhase } from "@/lib/community-messenger/call-v3/call-v3-types";

const callV3Timers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerCallV3Timer(callId: string, handle: ReturnType<typeof setTimeout>): void {
  const sid = callId.trim();
  if (!sid) return;
  const prev = callV3Timers.get(sid);
  if (prev) clearTimeout(prev);
  callV3Timers.set(sid, handle);
}

export function clearCallV3Timers(callId?: string): void {
  if (!callId) {
    for (const handle of callV3Timers.values()) clearTimeout(handle);
    callV3Timers.clear();
    return;
  }
  const sid = callId.trim();
  const handle = callV3Timers.get(sid);
  if (handle) clearTimeout(handle);
  callV3Timers.delete(sid);
}

/**
 * Single V3 cleanup entry — terminal/cancel/reject/end handlers call this only.
 */
export async function cleanupCallV3(callId: string, reason: CallV3TerminalPhase | string): Promise<void> {
  const sid = callId.trim();
  logCallV3("cleanup_start", { callId: sid, reason });
  clearCallV3MissedTimer(sid);
  clearCallV3Timers(sid);
  stopCallV3CallerActivePoll();
  const { leaveCallV3Agora } = await import("@/lib/community-messenger/call-v3/call-v3-agora");
  await leaveCallV3Agora(sid);
  clearCallV3NativePendingForCall(sid);
  stopCallV3Ringtone("cleanup");
  markCallV3IncomingDismissed(sid);
  useCallV3Store.getState().resetToIdle();
  const { canStartNewCall, canReceiveNewCall } = useCallV3Store.getState();
  logCallV3("cleanup_done", {
    callId: sid,
    reason,
    canStartNewCall,
    canReceiveNewCall,
  });
}
