"use client";

import {
  beginDockEnterTransition,
  commitDockEnterTransition,
} from "@/lib/community-messenger/call-dock-presentation";
import { dockCommunityCall, readDockedCallSessionId } from "@/lib/community-messenger/call-presentation-ownership";
import { syncCommunityMessengerCallRuntimeSurface } from "@/lib/community-messenger/call-runtime-registry";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4DockEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import { shouldSuppressCallV4FloatingDock } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-compact";
import { supportsCallV4FloatingDock } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";
import { maybeExitCallV4ScreenAfterCleanup } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { type CallV4Router } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";

export type CallV4MinimizeToDockInput = {
  callId: string;
  roomId?: string | null;
  reason: string;
  navigateAway?: boolean;
  router?: CallV4Router;
};

export async function callV4MinimizeConnectedCallToDock(input: CallV4MinimizeToDockInput): Promise<boolean> {
  const sid = input.callId.trim();
  if (!sid || !isCallV4DockEnabled() || !supportsCallV4FloatingDock()) return false;
  if (!canEnterCallV4PipOrDock(readCallV4Phase())) return false;
  if (shouldSuppressCallV4FloatingDock(sid)) return false;
  if (readDockedCallSessionId() === sid) return true;

  await beginDockEnterTransition(sid);
  dockCommunityCall({
    sessionId: sid,
    roomId: input.roomId ?? null,
    cleanup: async () => {},
  });
  commitDockEnterTransition(sid);
  syncCommunityMessengerCallRuntimeSurface({ presentation: "dock" });
  logCallV4("presentation_dock_minimize", {
    callId: sid,
    reason: input.reason,
    platform: "shared",
  });
  if (input.navigateAway !== false) {
    maybeExitCallV4ScreenAfterCleanup(sid, input.reason || "dock_minimize", input.router);
  }
  return true;
}
