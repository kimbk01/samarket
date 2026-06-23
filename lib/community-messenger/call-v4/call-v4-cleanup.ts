import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { stopCallV4CallerActivePoll } from "@/lib/community-messenger/call-v4/call-v4-caller-active";
import { clearCallV4NativeAcceptingSurface } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";

export async function cleanupCallV4(callId: string, reason: CallV4TerminalPhase | string): Promise<void> {
  const sid = callId.trim();
  logCallV4("cleanup_start", { callId: sid, reason });
  stopCallV4CallerActivePoll();
  const { leaveCallV4Agora } = await import("@/lib/community-messenger/call-v4/call-v4-agora");
  await leaveCallV4Agora(sid);
  clearCallV4NativeAcceptingSurface(sid);
  useCallV4Store.getState().resetToIdle();
  logCallV4("cleanup_done", { callId: sid, reason });
}
