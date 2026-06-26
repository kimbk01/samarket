"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import { shouldUseAndroidOsPipSafeLayout } from "@/lib/community-messenger/call-android-os-pip-layout";
import { subscribeCallPresentationOwnership } from "@/lib/community-messenger/call-presentation-ownership";
import {
  callV4Accept,
  callV4EnsureAgoraJoined,
  callV4HandleRejectRoute,
  hydrateCallV4CalleeScreen,
  startCallV4CallerActivePoll,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { ensureCallV4AudioRouteAfterConnectedGate } from "@/lib/community-messenger/call-v4/call-v4-audio-route";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { useCallV4MediaStore, seedCallV4MediaPresentationForCall } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { tryStartCallV4NativeAcceptAutostart } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { notifyCallV4WebCallScreenReady } from "@/lib/community-messenger/call-v4/call-v4-native-connecting-handoff";
import { maybeExitCallV4ScreenAfterCleanup } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { registerCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { useCallV4VideoPresenter } from "@/lib/community-messenger/call-v4/call-v4-video-presenter";
import { buildCallV4ScreenViewModel } from "@/lib/community-messenger/call-v4/call-v4-view-model";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  beginCallV4CalleeScreenHydrate,
  endCallV4CalleeScreenHydrate,
  isCallV4CalleeScreenHydrateInflight,
  shouldSuppressCallV4StaleRouteExit,
} from "@/lib/community-messenger/call-v4/call-v4-connected-gate";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { useCallV4RuntimeSurface } from "@/lib/community-messenger/call-v4/presentation/use-call-v4-runtime-surface";

type CallV4ScreenProps = {
  callId: string;
};

const CALL_V4_SCREEN_ACTIVE_PHASES = new Set<CallV4Phase>([
  "creating",
  "outgoing_ringing",
  "incoming_ringing",
  "accepting",
  "joining",
  "connected",
  "ending",
]);

export function CallV4Screen({ callId }: CallV4ScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { safeT } = useI18n();
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity);
  const connectedAt = useCallV4Store((s) => s.connectedAt);
  const mediaState = useCallV4MediaStore();
  const androidOsPipSafeMode = useSyncExternalStore(
    subscribeCallPresentationOwnership,
    () => shouldUseAndroidOsPipSafeLayout(callId),
    () => false,
  );
  const presenter = useCallV4VideoPresenter(callId, androidOsPipSafeMode);
  const action = searchParams?.get("action")?.trim() ?? null;
  const source = searchParams?.get("source")?.trim() ?? null;
  const incomingPreview = searchParams?.get("incomingPreview") === "1";
  const exitGuardRef = useRef(false);
  const nativeHandoffPhaseRef = useRef<"connecting" | "connected" | null>(null);

  useEffect(() => {
    logCallV4("call_v4_screen_component_mount_start", { callId });
  }, [callId]);

  useEffect(() => {
    logCallV4("call_v4_screen_component_mount_done", { callId, action, source });
  }, [action, callId, source]);

  useEffect(() => {
    nativeHandoffPhaseRef.current = null;
  }, [callId]);

  useEffect(() => {
    if (!callId) return;
    logCallV4("screen_mounted", { callId, source });
    logCallV4("connecting_visible", { callId, source });
    if (action !== "accept" && source !== "native_accept") return;
    if (nativeHandoffPhaseRef.current !== null) return;
    nativeHandoffPhaseRef.current = "connecting";
    void notifyCallV4WebCallScreenReady(callId, "connecting");
  }, [action, callId, source]);

  useEffect(() => {
    if (!callId || phase !== "connected") return;
    if (action !== "accept" && source !== "native_accept") return;
    if (nativeHandoffPhaseRef.current === "connected") return;
    nativeHandoffPhaseRef.current = "connected";
    void notifyCallV4WebCallScreenReady(callId, "connected");
  }, [action, callId, phase, source]);

  useEffect(() => {
    registerCallV4ExitRouter(router);
    return () => registerCallV4ExitRouter(null);
  }, [router]);

  useEffect(() => {
    if (!callId || action !== "accept") return;
    let cancelled = false;
    void (async () => {
      const existing = readCallV4Identity();
      const kind =
        existing?.callId === callId
          ? existing.mediaType
          : null;
      logCallV4("call_v4_accept_effect_enter", {
        callId,
        kind: kind ?? "pending",
        source: source ?? null,
      });
      if (!tryStartCallV4NativeAcceptAutostart(callId)) {
        logCallV4("call_v4_accept_autostart_blocked", { callId, source: source ?? null });
        return;
      }
      if (!existing || existing.callId !== callId) {
        await hydrateCallV4CalleeScreen(callId);
      }
      if (cancelled) return;
      const hydrated = readCallV4Identity();
      logCallV4("call_v4_accept_effect_ready", {
        callId,
        kind: hydrated?.callId === callId ? hydrated.mediaType : null,
      });
      await callV4Accept(callId, router, { skipRoute: true, source: source ?? "native" });
    })();
    return () => {
      cancelled = true;
    };
  }, [action, callId, router, source]);

  useEffect(() => {
    if (!callId || action !== "reject") return;
    void callV4HandleRejectRoute(callId, router);
  }, [action, callId, router]);

  useEffect(() => {
    if (!callId || source === "outgoing") return;
    const current = readCallV4Identity();
    if (current?.callId === callId) return;
    let cancelled = false;
    void (async () => {
      const hydrated = await hydrateCallV4CalleeScreen(callId);
      if (cancelled || hydrated) return;
      const session = await callV4FetchSession(callId);
      if (cancelled || !session?.id || session.isMineInitiator) return;
      logCallV4("callee_screen_hydrate_retry", { callId });
      await hydrateCallV4CalleeScreen(callId);
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, incomingPreview, source]);

  useEffect(() => {
    if (!callId || source !== "outgoing") return;
    const current = readCallV4Identity();
    if (current?.callId === callId) return;
    let cancelled = false;
    void (async () => {
      const session = await callV4FetchSession(callId);
      if (cancelled || !session?.id || !session.isMineInitiator || session.status !== "ringing") return;
      useCallV4Store.getState().setIdentity({
        callId: session.id,
        roomId: session.roomId,
        callerUserId: session.initiatorUserId,
        calleeUserId: session.recipientUserId ?? session.peerUserId ?? "",
        direction: "outgoing",
        mediaType: session.callKind === "video" ? "video" : "audio",
        createdAt: session.startedAt,
        peerLabel: session.peerLabel,
        peerAvatarUrl: session.peerAvatarUrl ?? null,
      });
      useCallV4Store.getState().setPhase("outgoing_ringing");
      logCallV4("outgoing_identity_hydrated", { callId });
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, source]);

  useEffect(() => {
    if (!callId) return;
    if (action === "accept") return;
    if (source === "sheet") return;
    if (incomingPreview) return;

    const current = readCallV4Identity();
    const currentPhase = readCallV4Phase();
    const identityMatches = current?.callId === callId;
    const activeOnRoute = identityMatches && CALL_V4_SCREEN_ACTIVE_PHASES.has(currentPhase);

    if (activeOnRoute) {
      exitGuardRef.current = false;
      return;
    }

    if (currentPhase === "joining" || currentPhase === "connected" || currentPhase === "accepting") {
      return;
    }

    if (isCallV4CalleeScreenHydrateInflight(callId)) {
      return;
    }

    if (exitGuardRef.current) return;
    exitGuardRef.current = true;

    let cancelled = false;
    void (async () => {
      beginCallV4CalleeScreenHydrate(callId);
      try {
        await hydrateCallV4CalleeScreen(callId);
        if (cancelled) return;
        const after = readCallV4Identity();
        const afterPhase = readCallV4Phase();
        if (
          shouldSuppressCallV4StaleRouteExit({
            routeCallId: callId,
            hydrateInflight: false,
            afterIdentityCallId: after?.callId ?? null,
            afterPhase,
            activePhases: CALL_V4_SCREEN_ACTIVE_PHASES,
          })
        ) {
          exitGuardRef.current = false;
          return;
        }
        if (afterPhase === "idle" || !after || after.callId !== callId) {
          logCallV4("screen_exit_stale_route", { callId, phase: afterPhase });
          maybeExitCallV4ScreenAfterCleanup(callId, "stale_route", router);
        }
      } finally {
        endCallV4CalleeScreenHydrate(callId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [action, callId, incomingPreview, phase, identity, router, source]);

  useEffect(() => {
    if (identity?.direction !== "outgoing") return;
    if (phase !== "outgoing_ringing" && phase !== "creating") return;
    if (identity.callId !== callId) return;
    logCallV4("caller_poll_start", { callId, phase });
    return startCallV4CallerActivePoll(callId);
  }, [callId, identity?.callId, identity?.direction, phase]);

  useEffect(() => {
    if (phase !== "joining" || identity?.callId !== callId) return;
    // Callee join is owned by callV4Accept (PATCH + Agora parallel). Outgoing uses caller poll.
    if (identity.direction === "incoming") return;
    let cancelled = false;
    void (async () => {
      await callV4EnsureAgoraJoined(callId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, identity?.callId, identity?.direction, phase]);

  const vm = useMemo(
    () =>
      buildCallV4ScreenViewModel({
        callId,
        phase: phase === "idle" && action === "accept" ? "joining" : phase,
        identity,
        connectedAt,
        safeT: (key, options) => safeT(key as Parameters<typeof safeT>[0], options),
        router,
        presenter,
        mediaState,
      }),
    [action, callId, phase, identity, connectedAt, safeT, router, presenter, mediaState]
  );

  useCallV4RuntimeSurface({
    callId,
    phase,
    identity,
    vm,
    router,
  });

  useEffect(() => {
    if (!identity || identity.callId !== callId) return;
    if (phase === "connected" || phase === "ending") return;
    seedCallV4MediaPresentationForCall(identity.mediaType);
  }, [callId, identity, phase]);

  useEffect(() => {
    if (!identity || identity.callId !== callId) return;
    if (phase !== "connected" || connectedAt == null) return;
    ensureCallV4AudioRouteAfterConnectedGate({
      callId,
      mediaType: identity.mediaType,
      direction: identity.direction,
      connectedAt,
    });
  }, [callId, connectedAt, identity, phase]);

  useEffect(() => {
    if (!callId || !vm) return;
    const branch = vm.mode === "video" && vm.phase === "connected" ? "connected_video_shell" : "call_screen";
    logCallV4("video_connected_branch_selected", {
      callId,
      branch,
      vmMode: vm.mode,
      vmPhase: vm.phase,
      storePhase: phase,
      showRemoteVideo: Boolean(vm.showRemoteVideo),
      pipShellMounted: Boolean(vm.pipShellMounted),
    });
  }, [callId, phase, vm?.mode, vm?.phase, vm?.showRemoteVideo, vm?.pipShellMounted]);

  if (!vm) {
    return null;
  }

  return (
    <div data-testid="call-v4-screen">
      <CallScreen vm={vm} variant="overlay" />
    </div>
  );
}
