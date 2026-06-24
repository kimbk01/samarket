import { stopCallV4CallerActivePoll } from "@/lib/community-messenger/call-v4/call-v4-caller-active";
import { stopCallV4ConnectedTerminalWatch } from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { clearCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { clearCallV4NativeAcceptingSurface, clearCallV4NativeIncomingSurface, clearCallV4SurfaceOwner } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { clearNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { syncCallV4NativeTerminalCleanup } from "@/lib/community-messenger/call-v4/call-v4-native-lifecycle";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";

export async function cleanupCallV4(callId: string, reason: CallV4TerminalPhase | string): Promise<void> {
  const sid = callId.trim();
  logCallV4("cleanup_start", { callId: sid, reason });
  stopCallV4CallerActivePoll();
  stopCallV4ConnectedTerminalWatch(sid);
  const { leaveCallV4Agora } = await import("@/lib/community-messenger/call-v4/call-v4-agora");
  await leaveCallV4Agora(sid);
  clearCallV4ConnectionWarm(sid);
  clearCallV4NativeAcceptingSurface(sid);
  clearNativeAcceptInflight(sid, String(reason));
  syncCallV4NativeTerminalCleanup(sid, reason);
  clearCallV4NativeIncomingSurface(sid, "cleanup");
  clearCallV4SurfaceOwner(sid, "cleanup");
  useCallV4Store.getState().resetToIdle();
  logCallV4("cleanup_done", { callId: sid, reason });
}
