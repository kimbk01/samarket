"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import {
  finishFullscreenRestoreFromDock,
  tryBeginFullscreenRestoreFromDock,
} from "@/lib/community-messenger/call-dock-presentation";
import {
  expandCommunityCallFromDock,
  resolveCallPresentationSurface,
} from "@/lib/community-messenger/call-presentation-ownership";
import {
  registerCommunityMessengerCallRuntime,
  resetCommunityMessengerCallRuntimeSurface,
  syncCommunityMessengerCallRuntimeSurface,
  type CallDockSnapshot,
} from "@/lib/community-messenger/call-runtime-registry";
import { callV4End } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { setCallV4MicEnabled } from "@/lib/community-messenger/call-v4/call-v4-agora-media";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { callV4MinimizeConnectedCallToDock } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-dock";
import { buildCallV4ScreenHref, type CallV4Router } from "@/lib/community-messenger/call-v4/call-v4-route";
import type { CallV4Identity, CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";

type UseCallV4RuntimeSurfaceInput = {
  callId: string;
  phase: CallV4Phase;
  identity: CallV4Identity | null;
  vm: CallScreenViewModel | null;
  router: CallV4Router;
};

export function shouldExposeCallV4DockSnapshot(input: {
  phase: CallV4Phase;
  vmPhase: CallScreenViewModel["phase"];
}): boolean {
  return input.phase === "connected" && input.vmPhase === "connected";
}

export function buildCallV4DockSnapshot(
  vm: CallScreenViewModel | null,
  timerText: string | null,
): CallDockSnapshot | null {
  if (!vm || !shouldExposeCallV4DockSnapshot({ phase: "connected", vmPhase: vm.phase })) return null;
  return {
    peerLabel: vm.peerLabel,
    peerAvatarUrl: vm.peerAvatarUrl ?? null,
    statusText: vm.connectionLabel ?? vm.statusText,
    timerText,
    micMuted: !vm.mediaState.micEnabled,
    cameraOff: !vm.mediaState.cameraEnabled,
    isVideo: vm.mode === "video",
    videoThumbSlot: null,
    remoteVideoThumbSlot: null,
    useSplitPreview: false,
  };
}

function formatLiveTimer(connectedAt: number | null | undefined, nowMs: number): string | null {
  if (connectedAt == null) return null;
  const seconds = Math.max(0, Math.floor((nowMs - connectedAt) / 1000));
  return formatCommunityMessengerCallDurationLabel(seconds);
}

function routeToFullScreen(callId: string, router: CallV4Router): void {
  const href = buildCallV4ScreenHref(callId, "dock_restore");
  const go = router.push ?? router.replace;
  go?.(href);
}

export function useCallV4RuntimeSurface({
  callId,
  phase,
  identity,
  vm,
  router,
}: UseCallV4RuntimeSurfaceInput): void {
  const sid = callId.trim();
  const roomId = identity?.roomId ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!vm?.connectedAt || phase !== "connected") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase, vm?.connectedAt]);

  const timerText = useMemo(() => formatLiveTimer(vm?.connectedAt, nowMs), [nowMs, vm?.connectedAt]);
  const dockSnapshot = useMemo(() => buildCallV4DockSnapshot(vm, timerText), [timerText, vm]);

  const handleExpand = useCallback(() => {
    if (!sid) return;
    const surface = resolveCallPresentationSurface(sid);
    if (surface === "DOCK") {
      if (!tryBeginFullscreenRestoreFromDock()) return;
      expandCommunityCallFromDock(sid);
      routeToFullScreen(sid, router);
      void finishFullscreenRestoreFromDock();
      return;
    }
    routeToFullScreen(sid, router);
  }, [router, sid]);

  const handleEnd = useCallback(() => {
    if (!sid) return;
    void callV4End(sid, router);
  }, [router, sid]);

  const handleToggleMute = useCallback(() => {
    if (!sid || !vm) return;
    void setCallV4MicEnabled(sid, !vm.mediaState.micEnabled);
  }, [sid, vm]);

  const handleMinimizeToDock = useCallback(() => {
    if (!sid) return;
    void callV4MinimizeConnectedCallToDock({
      callId: sid,
      roomId,
      reason: "runtime_surface_minimize",
      router,
    });
  }, [roomId, router, sid]);

  useEffect(() => {
    if (!sid || !identity || !canEnterCallV4PipOrDock(phase)) return;
    return registerCommunityMessengerCallRuntime({
      sessionId: sid,
      session: null,
      cleanupMedia: async () => {
        /* V4 terminal cleanup owns media disposal; presentation detach must not leave Agora. */
      },
      patchTerminalBestEffort: async () => {
        await callV4End(sid, router);
      },
    });
  }, [identity, phase, router, sid]);

  useLayoutEffect(() => {
    if (!sid || !identity || !vm) {
      resetCommunityMessengerCallRuntimeSurface();
      return;
    }

    const surface = resolveCallPresentationSurface(sid);
    const presentation = surface === "DOCK" ? "dock" : canEnterCallV4PipOrDock(phase) ? "fullscreen" : "idle";

    syncCommunityMessengerCallRuntimeSurface({
      presentation,
      videoPipLayout: vm.videoPipLayout ?? null,
      miniVideoSlot: vm.showLocalVideo ? vm.miniVideoSlot ?? null : null,
      expandToFullscreen: handleExpand,
      minimizeToPip: null,
      minimizeToDock: canEnterCallV4PipOrDock(phase) ? handleMinimizeToDock : null,
      dockSnapshot,
      onDockExpand: handleExpand,
      onDockEnd: handleEnd,
      onDockToggleMute: handleToggleMute,
    });

    return () => {
      resetCommunityMessengerCallRuntimeSurface();
    };
  }, [
    dockSnapshot,
    handleEnd,
    handleExpand,
    handleMinimizeToDock,
    handleToggleMute,
    identity,
    phase,
    sid,
    vm,
  ]);
}
