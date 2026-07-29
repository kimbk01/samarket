"use client";

import {
  assertPhoneVerifiedForMessengerActionOrOpenSheet,
  resolveMessengerActionReturnPath,
} from "@/lib/auth/assert-phone-verified-for-messenger-action-client";
import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import { ensureCallMediaForUserGesture } from "@/lib/community-messenger/call-media-permission-preflight";
import { pinCommunityMessengerCallTerminalSurfaceDismiss } from "@/lib/community-messenger/call-session-navigation-seed";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { notifyCommunityMessengerCallInviteHangupBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { postCommunityMessengerCallSessionTerminalBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  callV4CreateSession,
  callV4FetchSession,
  callV4MediaTypeFromKind,
  callV4PatchAccept,
  callV4PatchCancel,
  callV4PatchEnd,
  callV4PatchMissed,
  callV4PatchReject,
  callV4ReconcileBeforeCreate,
  callV4ResolveOutgoingRoomId,
} from "@/lib/community-messenger/call-v4/call-v4-api";
import { joinCallV4Agora, leaveCallV4Agora } from "@/lib/community-messenger/call-v4/call-v4-agora";
import { stopCallV4CallerActivePoll, startCallV4CallerActivePoll } from "@/lib/community-messenger/call-v4/call-v4-caller-active";
import { cleanupCallV4 } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { primeCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  clearCallV4MissedTimer,
  startCallV4OutgoingMissedTimer,
  type CallV4OutgoingMissedTimerFireContext,
} from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import {
  startNativeOutgoingTerminalSync,
  stopNativeOutgoingTerminalSync,
} from "@/lib/community-messenger/call-v4/native-outgoing-terminal-sync";
import {
  canRenderWebIncomingSheet,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { readCallV4SessionIdFromNativeRoute } from "@/lib/community-messenger/call-v4/call-v4-native-route";
import {
  syncCallV4NativeOnWebAccept,
  syncCallV4NativeOnWebReject,
} from "@/lib/community-messenger/call-v4/call-v4-native-lifecycle";
import { isCallV4VideoEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import { markCallV4MediaConnected } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import {
  claimCallV4AcceptPatchOnce,
  claimCallV4CancelPatchOnce,
  claimCallV4EndPatchOnce,
  claimCallV4RejectPatchOnce,
  markCallV4AcceptPatchDone,
  releaseCallV4CancelPatchClaim,
  tryClaimCallV4AcceptFlight,
} from "@/lib/community-messenger/call-v4/call-v4-patch-guard";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { isAndroidNativeOutgoingShell, isIOSNativeOutgoingShell, isIOSNativeVideoOutgoingShell, startNativeOutgoingEstablishment } from "@/lib/call/native/native-outgoing-bridge";
import { maybeExitCallV4ScreenAfterCleanup } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import {
  buildCallV4ScreenHref,
  exitCallV4ScreenAfterCleanup,
  rememberCallV4ReturnPath,
  readCallV4ExitRouter,
  routeToCallV4Screen,
  type CallV4Router,
} from "@/lib/community-messenger/call-v4/call-v4-route";
import {
  readCallV4Capabilities,
  readCallV4Identity,
  readCallV4Phase,
  releaseCallV4OutgoingGateAfterTerminalFinalize,
  useCallV4Store,
} from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Identity, CallV4Phase, CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";

const HYDRATE_PROTECTED_PHASES = new Set<CallV4Phase>(["accepting", "joining", "connected"]);
const REMOTE_TERMINAL_ALLOWED_PHASES = new Set<CallV4Phase>(["joining", "connected"]);

const remoteTerminalFinalized = new Set<string>();
const missedPatchClaimed = new Set<string>();

const MISSED_TIMEOUT_TERMINAL_PHASES = new Set<CallV4Phase>([
  "ending",
  "ended",
  "rejected",
  "missed",
  "cancelled",
  "failed",
  "idle",
]);

function resolveOutgoingMissedTimeoutEligibility(
  callId: string,
  fireContext?: CallV4OutgoingMissedTimerFireContext,
): { eligible: boolean; reason: string } {
  const sid = callId.trim();
  if (!sid) return { eligible: false, reason: "empty_call_id" };

  const phase = readCallV4Phase();
  if (MISSED_TIMEOUT_TERMINAL_PHASES.has(phase)) {
    return { eligible: false, reason: `terminal_phase:${phase}` };
  }
  if (phase === "connected") {
    return { eligible: false, reason: "connected_phase" };
  }

  const identity = readCallV4Identity();
  const identityOk = identity?.callId === sid && identity.direction === "outgoing";
  const phaseOk = phase === "outgoing_ringing" || phase === "creating";
  if (identityOk && phaseOk) {
    return { eligible: true, reason: "identity_phase_ok" };
  }

  const nativeOutgoingRoute =
    isLegacyWebCallEstablishmentRemoved() && isAndroidOutgoingPresentationRoute(sid);
  if (nativeOutgoingRoute) {
    if (identityOk && (phaseOk || phase === "joining")) {
      return { eligible: true, reason: "native_outgoing_route_drift" };
    }
    if (fireContext?.callId === sid && fireContext.direction === "outgoing") {
      return { eligible: true, reason: "native_outgoing_scheduled_timer" };
    }
    if (
      readCurrentCallV4RouteCallId() === sid &&
      (phaseOk || phase === "joining")
    ) {
      return { eligible: true, reason: "native_outgoing_route_phase" };
    }
  }

  return {
    eligible: false,
    reason: `identity_phase_mismatch:identity=${identity?.callId ?? "none"}:${identity?.direction ?? "none"}:phase=${phase}`,
  };
}

async function finalizeOutgoingMissedTimeout(
  callId: string,
  source: string,
  router: CallV4Router | undefined,
  identity: CallV4Identity | null,
): Promise<void> {
  const sid = callId.trim();
  notifyCallV4PeerTerminalBestEffort(sid, identity, "missed");
  await finalizeCallV4Terminal(sid, "missed", router ?? readCallV4ExitRouter() ?? undefined);
  logCallV4("missed_timeout_finalize_done", { callId: sid, source });
}

const MISSED_TIMEOUT_TERMINAL_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "ended",
  "missed",
  "failed",
  "failed_or_stale",
]);

function claimCallV4MissedPatchOnce(callId: string): boolean {
  const sid = callId.trim();
  if (!sid || missedPatchClaimed.has(sid)) return false;
  missedPatchClaimed.add(sid);
  return true;
}

function releaseCallV4MissedPatchClaim(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  missedPatchClaimed.delete(sid);
}

function isCallV4TerminalSessionStatus(status: string | null | undefined): boolean {
  return MISSED_TIMEOUT_TERMINAL_STATUSES.has((status ?? "").trim().toLowerCase());
}

function isCallV4NativeAcceptHandoffSource(source: string | null | undefined): boolean {
  if (!source?.trim()) return false;
  const normalized = source.trim().toLowerCase();
  return normalized === "native_accept" || normalized === "native_lock_accept" || normalized.includes("lock");
}

/** Ringing session must not downgrade accept-in-progress phases during callee hydrate. */
export function shouldHydrateOverwriteCallV4Phase(
  currentPhase: CallV4Phase,
  sessionStatus: string,
): boolean {
  if (sessionStatus !== "ringing") return false;
  return !HYDRATE_PROTECTED_PHASES.has(currentPhase);
}

function applyCalleeHydratePhase(callId: string, session: CommunityMessengerCallSession, inflight: boolean): void {
  const currentPhase = readCallV4Phase();
  if (inflight) {
    useCallV4Store.getState().setPhase("joining");
    return;
  }
  if (session.status === "active") {
    useCallV4Store.getState().setPhase("joining");
    return;
  }
  if (session.status !== "ringing") return;
  if (shouldHydrateOverwriteCallV4Phase(currentPhase, session.status)) {
    useCallV4Store.getState().setPhase("incoming_ringing");
    return;
  }
  logCallV4("hydrate_phase_preserved", {
    callId,
    sessionStatus: session.status,
    currentPhase,
  });
}

export type CallV4OutgoingLaunchResult =
  | { ok: true; session: CommunityMessengerCallSession; roomId: string }
  | { ok: false; userMessage: string; phoneVerificationRequired?: boolean };

let outgoingCreateInFlight: Promise<CallV4OutgoingLaunchResult> | null = null;

function buildOutgoingIdentity(
  session: CommunityMessengerCallSession,
  peerLabel?: string | null
): CallV4Identity {
  return {
    callId: session.id,
    roomId: session.roomId,
    callerUserId: session.initiatorUserId,
    calleeUserId: session.recipientUserId ?? session.peerUserId ?? "",
    direction: "outgoing",
    mediaType: session.callKind === "video" ? "video" : "audio",
    createdAt: session.startedAt,
    peerLabel: peerLabel?.trim() || session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl ?? null,
  };
}

function buildIncomingIdentity(session: CommunityMessengerCallSession): CallV4Identity {
  return {
    callId: session.id,
    roomId: session.roomId,
    callerUserId: session.initiatorUserId,
    calleeUserId: session.recipientUserId ?? session.peerUserId ?? "",
    direction: "incoming",
    mediaType: session.callKind === "video" ? "video" : "audio",
    createdAt: session.startedAt,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl ?? null,
  };
}

async function ensureCallV4CalleeIdentity(callId: string): Promise<CallV4Identity | null> {
  const sid = callId.trim();
  if (!sid) return null;
  const current = readCallV4Identity();
  if (current?.callId === sid) return current;
  const session = await callV4FetchSession(sid);
  if (!session || session.isMineInitiator) return null;
  const identity = buildIncomingIdentity(session);
  useCallV4Store.getState().setIdentity(identity);
  logCallV4("accept_identity_hydrated", { callId: sid });
  return identity;
}

/** Callee call screen — hydrate store when route lands before discovery. */
export async function hydrateCallV4CalleeScreen(callId: string): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, source: "hydrate_callee_screen" });
    return false;
  }
  const inflight = isNativeAcceptInflight(sid);
  const existingIdentity = readCallV4Identity();
  if (existingIdentity?.callId === sid) {
    if (inflight && readCallV4Phase() === "incoming_ringing") {
      useCallV4Store.getState().setPhase("joining");
    }
    return true;
  }
  const session = await callV4FetchSession(sid);
  if (!session?.id || session.isMineInitiator) return false;
  useCallV4Store.getState().setIdentity(buildIncomingIdentity(session));
  applyCalleeHydratePhase(sid, session, inflight);
  logCallV4("callee_screen_hydrated", { callId: sid, status: session.status, inflight });
  return true;
}

function outgoingMissingRoomMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_outgoing_missing_room", {
    fallbackKo: "방 정보가 없어 통화를 시작할 수 없습니다.",
    fallbackEn: "Cannot start a call because room information is missing.",
  });
}

function outgoingGenericErrorMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "common_content_unavailable", {
    fallbackKo: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    fallbackEn: "Could not start the call. Please try again.",
  });
}

function resolveCallV4PeerUserId(identity: CallV4Identity): string {
  return identity.direction === "outgoing" ? identity.calleeUserId : identity.callerUserId;
}

function notifyCallV4PeerTerminalBestEffort(callId: string, identity: CallV4Identity | null, terminalStatus: string): void {
  const sid = callId.trim();
  if (!sid || !identity || identity.callId !== sid) return;
  const peerUserId = resolveCallV4PeerUserId(identity).trim();
  if (peerUserId) {
    void notifyCommunityMessengerCallInviteHangupBestEffort(peerUserId, sid, {
      roomId: identity.roomId ?? null,
      initiatorUserId: identity.callerUserId,
      terminalStatus,
    });
  }
  postCommunityMessengerCallSessionTerminalBusEvent({
    sessionId: sid,
    roomId: identity.roomId ?? null,
    status: terminalStatus,
  });
}

/** Terminal finalize can be triggered twice for one call (local end_patch + remote bus signal). Run once. */
const finalizedCallV4Ids = new Set<string>();

async function finalizeCallV4Terminal(
  callId: string,
  reason: CallV4TerminalPhase | string,
  router?: CallV4Router
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  const reasonStr = String(reason);
  if (finalizedCallV4Ids.has(sid)) {
    logCallV4("terminal_finalize_skipped_duplicate", { callId: sid, reason: reasonStr });
    return;
  }
  finalizedCallV4Ids.add(sid);
  const wasOutgoingPresentationRoute = isAndroidOutgoingPresentationRoute(sid);
  try {
    await cleanupCallV4(sid, reason);
    pinCommunityMessengerCallTerminalSurfaceDismiss(sid);
    void hardClearActiveCallSession(sid, "call_v4_terminal_finalize");
  } catch (error) {
    logCallV4("terminal_finalize_cleanup_failed", {
      callId: sid,
      reason: reasonStr,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  runCallV4ScreenExitAfterTerminalCleanup(sid, reasonStr, router, wasOutgoingPresentationRoute);
}

function runCallV4ScreenExitAfterTerminalCleanup(
  callId: string,
  reason: string,
  router?: CallV4Router,
  wasOutgoingPresentationRoute = false,
): void {
  const sid = callId.trim();
  if (wasOutgoingPresentationRoute || isAndroidOutgoingPresentationRoute(sid)) {
    logCallV4("outgoing_presentation_exit", {
      callId: sid,
      reason,
    });
    exitCallV4ScreenAfterCleanup(router);
    return;
  }
  if (isLegacyWebCallEstablishmentRemoved()) {
    if (isAndroidOutgoingPresentationRoute(sid)) {
      logCallV4("android_outgoing_presentation_exit", {
        callId: sid,
        reason,
      });
      exitCallV4ScreenAfterCleanup(router);
    } else {
      logCallV4("legacy_web_establishment_removed", {
        callId: sid,
        trigger: "exit_screen_after_cleanup",
        reason,
      });
    }
    return;
  }
  maybeExitCallV4ScreenAfterCleanup(sid, reason, router);
}

function mapCallV4RemoteTerminalReason(status: string | null | undefined): CallV4TerminalPhase {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "ended") return "ended";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "failed" || normalized === "failed_or_stale") return "failed";
  return "rejected";
}

function readCurrentCallV4RouteCallId(): string | null {
  if (typeof window === "undefined") return null;
  return readCallV4SessionIdFromNativeRoute(`${window.location.pathname}${window.location.search}`);
}

/** Android sync-only — post-cleanup exit for Web outgoing presentation shell only. */
function isAndroidOutgoingPresentationRoute(callId: string): boolean {
  if (typeof window === "undefined") return false;
  const sid = callId.trim();
  if (!sid) return false;
  const route = `${window.location.pathname}${window.location.search}`;
  if (readCallV4SessionIdFromNativeRoute(route) !== sid) return false;
  const source = new URLSearchParams(window.location.search).get("source");
  return source?.trim() === "outgoing";
}

function canHandleCallV4RemoteTerminal(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  const identity = readCallV4Identity();
  if (identity?.callId === sid) return true;
  const phase = readCallV4Phase();
  return readCurrentCallV4RouteCallId() === sid && REMOTE_TERMINAL_ALLOWED_PHASES.has(phase);
}

export async function callV4CreateOutgoing(input: {
  roomId?: string | null;
  peerUserId?: string | null;
  peerLabel?: string | null;
  mediaType: "audio" | "video";
  signal?: AbortSignal;
  router: { push: (href: string) => void; replace?: (href: string) => void };
}): Promise<CallV4OutgoingLaunchResult> {
  logCallV4("MARKER_A", { mediaType: input.mediaType });
  const { canStartNewCall } = readCallV4Capabilities();
  if (!canStartNewCall) {
    logCallV4("outgoing_create_blocked_canStartNewCall", {
      phase: readCallV4Phase(),
      identityCallId: readCallV4Identity()?.callId ?? null,
    });
    return { ok: false as const, userMessage: outgoingGenericErrorMessage() };
  }

  if (outgoingCreateInFlight) {
    return outgoingCreateInFlight;
  }

  const flight: Promise<CallV4OutgoingLaunchResult> = (async (): Promise<CallV4OutgoingLaunchResult> => {
    useCallV4Store.getState().setPhase("creating");
    useCallV4Store.setState({ canStartNewCall: false });

    await callV4ReconcileBeforeCreate();

    const roomResolved = await callV4ResolveOutgoingRoomId({
      roomId: input.roomId,
      peerUserId: input.peerUserId,
      signal: input.signal,
    });
    if (!roomResolved.ok) {
      useCallV4Store.getState().resetToIdle();
      return { ok: false as const, userMessage: outgoingMissingRoomMessage() };
    }

    logCallV4("outgoing_create_session_attempt", {
      mediaType: input.mediaType,
      roomId: roomResolved.roomId,
      peerUserId: input.peerUserId?.trim() || undefined,
    });

    const created = await callV4CreateSession({
      roomId: roomResolved.roomId,
      mediaType: input.mediaType,
    });

    if (!created.ok || !created.session?.id) {
      useCallV4Store.getState().resetToIdle();
      const err = String(created.error ?? "").trim();
      logCallV4("outgoing_create_session_failed", {
        mediaType: input.mediaType,
        roomId: roomResolved.roomId,
        error: err || "unknown",
      });
      return { ok: false as const, userMessage: err || outgoingGenericErrorMessage() };
    }

    logCallV4("outgoing_create_session_done", {
      callId: created.session.id,
      mediaType: input.mediaType,
      callKind: created.session.callKind,
      roomId: roomResolved.roomId,
    });

    const identity = buildOutgoingIdentity(created.session, input.peerLabel);
    useCallV4Store.getState().setIdentity(identity);
    useCallV4Store.getState().setPhase("outgoing_ringing");
    let shouldRouteToWebOutgoingPresentation = true;

    const androidNativeShell = isAndroidNativeOutgoingShell();
    const iosNativeShell = androidNativeShell
      ? false
      : input.mediaType === "video"
        ? await isIOSNativeVideoOutgoingShell()
        : await isIOSNativeOutgoingShell();
    logCallV4("MARKER_B", {
      callId: created.session.id,
      iosNativeShell,
      androidNativeShell,
      mediaType: input.mediaType,
    });

    if (androidNativeShell || iosNativeShell) {
      logCallV4("native_outgoing_handoff_start", {
        callId: created.session.id,
        mediaType: input.mediaType,
        roomId: roomResolved.roomId,
      });
      logCallV4("MARKER_C", {
        callId: created.session.id,
        mediaType: input.mediaType,
        roomId: roomResolved.roomId,
      });
      const nativeHandoff = await startNativeOutgoingEstablishment({
        callId: created.session.id,
        roomId: roomResolved.roomId,
        mediaType: input.mediaType,
        peerUserId: input.peerUserId,
        peerName: input.peerLabel,
      });
      if (nativeHandoff.ok && nativeHandoff.nativeOwned) {
        logCallV4("native_outgoing_handoff_done", {
          callId: created.session.id,
          mediaType: input.mediaType,
          roomId: roomResolved.roomId,
        });
        clearCallV4MissedTimer();
        startCallV4OutgoingMissedTimer(created.session.id, identity.createdAt, input.router);
        startNativeOutgoingTerminalSync(created.session.id, input.router);
        shouldRouteToWebOutgoingPresentation = false;
      } else {
        if (!nativeHandoff.ok && !nativeHandoff.nativeOwned) {
          logCallV4("native_establishment_unavailable", {
            callId: created.session.id,
            mediaType: input.mediaType,
            roomId: roomResolved.roomId,
          });
        }
        logCallV4("native_outgoing_failed", {
          callId: created.session.id,
          mediaType: input.mediaType,
          roomId: roomResolved.roomId,
          ok: nativeHandoff.ok,
          nativeOwned: nativeHandoff.nativeOwned,
        });
      }
    }

    if (shouldRouteToWebOutgoingPresentation) {
      logCallV4("call_route_enter", {
        callId: created.session.id,
        roomId: roomResolved.roomId,
        wall_ms: Date.now(),
        mono_ms: typeof performance !== "undefined" ? performance.now() : Date.now(),
      });
      routeToCallV4Screen(input.router, created.session.id, "outgoing");
      logCallV4("outgoing_ringing", { callId: created.session.id, roomId: roomResolved.roomId });
    }

    logCallV4("native_create_resolved", {
      callId: created.session.id,
      routedWeb: shouldRouteToWebOutgoingPresentation,
      wall_ms: Date.now(),
      mono_ms: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });

    return { ok: true as const, session: created.session, roomId: roomResolved.roomId };
  })();

  outgoingCreateInFlight = flight;
  void flight.finally(() => {
    outgoingCreateInFlight = null;
  });

  return flight;
}

/** SSOT launch for all outgoing CTAs when V4 Telegram Lane flag is ON. */
export async function callV4LaunchOutgoingDirectCall(
  input: {
    signal?: AbortSignal;
    roomId?: string | null;
    peerUserId?: string | null;
    peerLabel?: string | null;
    kind: CommunityMessengerCallKind;
  },
  router: { push: (href: string) => void; replace?: (href: string) => void }
): Promise<CallV4OutgoingLaunchResult> {
  logCallV4("call_v4_launch_direct_enter", {
    kind: input.kind,
    roomId: input.roomId?.trim() || undefined,
    peerUserId: input.peerUserId?.trim() || undefined,
  });

  if (!assertPhoneVerifiedForMessengerActionOrOpenSheet(resolveMessengerActionReturnPath())) {
    logCallV4("call_v4_launch_direct_blocked", { reason: "phone_verification_required", kind: input.kind });
    return { ok: false, userMessage: "", phoneVerificationRequired: true };
  }
  if (!isCallV4VideoEnabled() && input.kind === "video") {
    logCallV4("call_v4_video_preflight_failed", { reason: "video_flag_disabled" });
    showMessengerSnackbar(
      safeTranslate(getRuntimeAppLanguage(), "common_content_unavailable", {
        fallbackKo: "지금은 음성 통화만 사용할 수 있습니다.",
        fallbackEn: "Only voice calls are available right now.",
      }),
      { variant: "error" }
    );
    return { ok: false, userMessage: "" };
  }
  {
    logCallV4("call_v4_media_preflight_start", { kind: input.kind });
    logCallV4("media_prime_started", {
      kind: input.kind,
      wall_ms: Date.now(),
      mono_ms: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });
    const perm = await ensureCallMediaForUserGesture(input.kind);
    logCallV4("media_prime_resolved", {
      kind: input.kind,
      ok: perm.ok,
      wall_ms: Date.now(),
      mono_ms: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });
    if (!perm.ok) {
      logCallV4("call_v4_media_preflight_failed", {
        kind: input.kind,
        reason: perm.reason,
        microphone: perm.state.microphone,
        camera: perm.state.camera,
      });
      showMessengerSnackbar(
        safeTranslate(getRuntimeAppLanguage(), "common_content_unavailable", {
          fallbackKo:
            input.kind === "video" ? "카메라·마이크 권한이 필요합니다." : "마이크 권한이 필요합니다.",
          fallbackEn:
            input.kind === "video"
              ? "Camera and microphone permissions are required."
              : "Microphone permission is required.",
        }),
        { variant: "error" },
      );
      return { ok: false, userMessage: "" };
    }
    logCallV4("call_v4_media_preflight_done", {
      kind: input.kind,
      microphone: perm.state.microphone,
      camera: perm.state.camera,
    });
  }

  if (typeof window !== "undefined") {
    rememberCallV4ReturnPath();
  }

  logCallV4("outgoing_launch", {
    roomId: input.roomId?.trim() || undefined,
    peerUserId: input.peerUserId?.trim() || undefined,
    mediaType: callV4MediaTypeFromKind(input.kind),
  });
  logCallV4("native_create_started", {
    kind: input.kind,
    wall_ms: Date.now(),
    mono_ms: typeof performance !== "undefined" ? performance.now() : Date.now(),
  });

  return callV4CreateOutgoing({
    roomId: input.roomId,
    peerUserId: input.peerUserId,
    peerLabel: input.peerLabel,
    mediaType: callV4MediaTypeFromKind(input.kind),
    signal: input.signal,
    router,
  });
}

export async function callV4Cancel(callId: string, router: CallV4Router): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;

  logCallV4("cancel_click", { callId: sid });
  clearCallV4MissedTimer(sid);
  stopCallV4CallerActivePoll();

  if (!claimCallV4CancelPatchOnce(sid)) {
    return;
  }

  useCallV4Store.getState().setPhase("ending");

  const patched = await callV4PatchCancel(sid);
  if (!patched.ok) {
    releaseCallV4CancelPatchClaim(sid);
    useCallV4Store.getState().setPhase("outgoing_ringing");
    return;
  }

  notifyCallV4PeerTerminalBestEffort(sid, readCallV4Identity(), "cancelled");
  await finalizeCallV4Terminal(sid, "cancelled", router);
}

export { startCallV4CallerActivePoll, stopCallV4CallerActivePoll };

export function callV4IncomingDiscovered(session: CommunityMessengerCallSession): void {
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", {
      callId: session.id?.trim() ?? "",
      trigger: "incoming_discovered",
    });
    return;
  }
  const callId = session.id?.trim() ?? "";
  if (!callId || session.status !== "ringing" || session.isMineInitiator) return;

  const sheetEval = canRenderWebIncomingSheet({ callId, phase: "incoming_ringing" });
  if (!sheetEval.canRender) {
    logCallV4("incoming_discovered_blocked", { callId, reason: sheetEval.reason });
    return;
  }

  const phase = readCallV4Phase();
  const current = readCallV4Identity();
  if (current?.callId === callId && phase !== "idle") {
    if (phase === "incoming_ringing") {
      logCallV4("incoming_surface_duplicate_blocked", { callId });
    }
    return;
  }
  logCallV4("incoming_discovered", { callId, roomId: session.roomId });
  primeCallV4ConnectionWarm(callId);
  useCallV4Store.getState().setIdentity(buildIncomingIdentity(session));
  useCallV4Store.getState().setPhase("incoming_ringing");
}

export async function callV4Accept(
  callId: string,
  router: { push: (href: string) => void; replace?: (href: string) => void },
  options?: { skipRoute?: boolean; source?: string }
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, trigger: "call_v4_accept" });
    return;
  }
  logCallV4("call_v4_accept_enter", { callId: sid, source: options?.source ?? null });
  logCallV4("accept_click", { callId: sid, source: options?.source ?? null });

  syncCallV4NativeOnWebAccept(sid);

  const existingIdentity = readCallV4Identity();
  const hasStoreIdentity = existingIdentity?.callId === sid;

  rememberCallV4ReturnPath();
  primeCallV4ConnectionWarm(sid);
  const acceptPhase = readCallV4Phase();
  if (acceptPhase === "idle" || acceptPhase === "incoming_ringing" || acceptPhase === "accepting") {
    useCallV4Store.getState().setPhase("accepting");
  }

  if (!options?.skipRoute) {
    const href = buildCallV4ScreenHref(sid, options?.source ?? "sheet");
    logCallV4("route_to_screen", { callId: sid, href });
    (router.replace ?? router.push)(href);
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();

  logCallV4("accept_identity_resolve_start", { callId: sid, hasStoreIdentity });
  const identity = hasStoreIdentity ? existingIdentity! : await ensureCallV4CalleeIdentity(sid);
  if (!identity) {
    logCallV4("accept_identity_missing", { callId: sid });
    useCallV4Store.getState().setPhase("failed");
    await finalizeCallV4Terminal(sid, "failed", router);
    return;
  }

  const mediaKind = identity.mediaType === "video" ? "video" : "voice";
  logCallV4("call_v4_accept_media_preflight_start", { callId: sid, kind: mediaKind });
  const mediaPerm = await ensureCallMediaForUserGesture(mediaKind, { callId: sid });
  if (!mediaPerm.ok) {
    logCallV4("call_v4_accept_media_preflight_failed", {
      callId: sid,
      kind: mediaKind,
      reason: mediaPerm.reason,
      microphone: mediaPerm.state.microphone,
      camera: mediaPerm.state.camera,
    });
    await leaveCallV4Agora(sid);
    useCallV4Store.getState().setPhase("failed");
    await finalizeCallV4Terminal(sid, "failed", router);
    return;
  }
  logCallV4("call_v4_accept_media_preflight_done", {
    callId: sid,
    kind: mediaKind,
    microphone: mediaPerm.state.microphone,
    camera: mediaPerm.state.camera,
  });

  const nativeAcceptSource = (options?.source ?? "").trim();
  const nativeAcceptPatched = isCallV4NativeAcceptHandoffSource(nativeAcceptSource);
  if (nativeAcceptPatched) {
    if (!tryClaimCallV4AcceptFlight(sid)) return;
    markCallV4AcceptPatchDone(sid);
    useCallV4Store.getState().setPhase("joining");
    logCallV4("callee_join_sequence_start", {
      callId: sid,
      kind: identity.mediaType,
      source: options?.source ?? null,
      sessionStatus: "native_lock_accept_patch",
    });
    await callV4EnsureAgoraJoined(sid, { afterPatch: true });
    return;
  }

  if (!claimCallV4AcceptPatchOnce(sid)) return;

  useCallV4Store.getState().setPhase("joining");

  const patched = await callV4PatchAccept(sid);

  if (!patched.ok) {
    logCallV4("accept_patch_failed", { callId: sid, error: patched.error ?? null });
    await leaveCallV4Agora(sid);
    useCallV4Store.getState().setPhase("failed");
    await finalizeCallV4Terminal(sid, "failed", router);
    return;
  }

  logCallV4("callee_join_sequence_start", {
    callId: sid,
    kind: identity.mediaType,
    source: options?.source ?? null,
    sessionStatus: patched.session?.status ?? null,
  });
  await callV4EnsureAgoraJoined(sid, { afterPatch: true });
}

export async function callV4EnsureAgoraJoined(
  callId: string,
  options?: { afterPatch?: boolean },
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  clearCallV4MissedTimer(sid);
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, trigger: "ensure_agora_joined" });
    return;
  }

  const identity = readCallV4Identity();
  if (!identity || identity.callId !== sid) return;
  if (identity.mediaType !== "audio" && identity.mediaType !== "video") return;

  let phase = readCallV4Phase();
  if (phase === "outgoing_ringing" || phase === "creating") {
    useCallV4Store.getState().setPhase("joining");
    phase = "joining";
  }
  if (phase !== "joining" && phase !== "accepting") return;

  const joined = await joinCallV4Agora(sid, { afterPatch: options?.afterPatch ?? false });
  if (!joined) {
    logCallV4("agora_join_not_ready", { callId: sid, phase: readCallV4Phase() });
    return;
  }

  markCallV4MediaConnected(sid, "ensure_agora_joined");
}

export async function callV4Reject(callId: string, router?: CallV4Router): Promise<void> {
  const sid = callId.trim();
    if (!sid) return;
  logCallV4("reject_start", { callId: sid });
  clearCallV4MissedTimer(sid);
  syncCallV4NativeOnWebReject(sid);
  if (!claimCallV4RejectPatchOnce(sid)) return;
  useCallV4Store.getState().setPhase("ending");
  const identity = readCallV4Identity();
  const patched = await callV4PatchReject(sid);
  if (!patched.ok) {
    logCallV4("reject_patch_failed_terminal_cleanup", { callId: sid, error: patched.error ?? null });
  }
  notifyCallV4PeerTerminalBestEffort(sid, identity, "rejected");
  await finalizeCallV4Terminal(sid, "rejected", router);
}

export async function callV4HandleRejectRoute(callId: string, router?: CallV4Router): Promise<void> {
  await callV4Reject(callId, router);
}

export async function callV4HandleRemoteTerminal(
  callId: string,
  status?: string | null,
  router?: CallV4Router,
  source = "unknown"
): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  if (!canHandleCallV4RemoteTerminal(sid)) {
    logCallV4("remote_terminal_ignored", { callId: sid, status: status ?? null, source, reason: "not_current_call" });
    return;
  }
  if (remoteTerminalFinalized.has(sid)) {
    logCallV4("remote_terminal_ignored", { callId: sid, status: status ?? null, source, reason: "duplicate" });
    return;
  }
  remoteTerminalFinalized.add(sid);
  logCallV4("remote_terminal_received", { callId: sid, status: status ?? null, source });
  logCallV4("remote_terminal_finalize", { callId: sid, source });
  releaseCallV4OutgoingGateAfterTerminalFinalize({ callId: sid, status, source });
  clearCallV4MissedTimer(sid);
  stopCallV4CallerActivePoll();
  stopNativeOutgoingTerminalSync(sid);
  await finalizeCallV4Terminal(sid, mapCallV4RemoteTerminalReason(status), router ?? readCallV4ExitRouter() ?? undefined);
}

export async function callV4HandleMissedTimeout(
  callId: string,
  source: string,
  router?: CallV4Router,
  fireContext?: CallV4OutgoingMissedTimerFireContext,
): Promise<void> {
  const sid = callId.trim();
  if (!sid) {
    logCallV4("missed_timeout_skipped", { callId: sid, source, reason: "empty_call_id" });
    return;
  }

  const eligibility = resolveOutgoingMissedTimeoutEligibility(sid, fireContext);
  if (!eligibility.eligible) {
    logCallV4("missed_timeout_skipped", { callId: sid, source, reason: eligibility.reason });
    return;
  }
  logCallV4("missed_timeout_eligible", { callId: sid, source, reason: eligibility.reason });

  const identity = readCallV4Identity();
  const session = await callV4FetchSession(sid);
  if (session && isCallV4TerminalSessionStatus(session.status)) {
    await callV4HandleRemoteTerminal(sid, session.status, router, source);
    return;
  }
  if (session && session.status === "active") {
    // Callee already accepted (server session is "active") — the caller-active poll should have
    // caught this, but a stuck native bridge call (isNativeEstablishmentOwned) can starve it.
    // Never patch this session as "missed" once it's active; join instead.
    logCallV4("missed_timeout_session_already_active", { callId: sid, source });
    clearCallV4MissedTimer(sid);
    stopCallV4CallerActivePoll();
    await callV4EnsureAgoraJoined(sid);
    return;
  }

  const nativeOutgoingShell =
    isLegacyWebCallEstablishmentRemoved() && isAndroidOutgoingPresentationRoute(sid);

  if (!claimCallV4MissedPatchOnce(sid)) {
    logCallV4("missed_patch_claim_skipped", { callId: sid, source });
    const retrySession = await callV4FetchSession(sid);
    if (retrySession && isCallV4TerminalSessionStatus(retrySession.status)) {
      await callV4HandleRemoteTerminal(sid, retrySession.status, router, source);
      return;
    }
    if (nativeOutgoingShell) {
      const retryPatch = await callV4PatchMissed(sid);
      const afterRetrySession = await callV4FetchSession(sid);
      if (
        retryPatch.ok ||
        (afterRetrySession && isCallV4TerminalSessionStatus(afterRetrySession.status))
      ) {
        await finalizeOutgoingMissedTimeout(sid, source, router, identity);
      } else {
        logCallV4("missed_timeout_skipped", { callId: sid, source, reason: "patch_claim_busy" });
      }
    } else {
      logCallV4("missed_timeout_skipped", { callId: sid, source, reason: "patch_claim_busy" });
    }
    return;
  }

  clearCallV4MissedTimer(sid);
  stopCallV4CallerActivePoll();

  const patched = await callV4PatchMissed(sid);
  if (!patched.ok) {
    const afterPatchSession = await callV4FetchSession(sid);
    if (afterPatchSession && isCallV4TerminalSessionStatus(afterPatchSession.status)) {
      notifyCallV4PeerTerminalBestEffort(sid, identity, afterPatchSession.status);
      await finalizeCallV4Terminal(sid, mapCallV4RemoteTerminalReason(afterPatchSession.status), router);
      return;
    }
    if (afterPatchSession && afterPatchSession.status === "active") {
      // Same race as above, caught this time by the post-patch-failure refetch:
      // "missed" was rejected (bad_action) precisely because the callee accepted in between.
      logCallV4("missed_patch_failed_session_already_active", { callId: sid, source });
      releaseCallV4MissedPatchClaim(sid);
      await callV4EnsureAgoraJoined(sid);
      return;
    }
    if (nativeOutgoingShell) {
      logCallV4("missed_patch_failed_force_finalize", {
        callId: sid,
        source,
        error: patched.error ?? null,
      });
      await finalizeOutgoingMissedTimeout(sid, source, router, identity);
      return;
    }
    releaseCallV4MissedPatchClaim(sid);
    logCallV4("missed_patch_failed", { callId: sid, source, error: patched.error ?? null });
    return;
  }

  await finalizeOutgoingMissedTimeout(sid, source, router, identity);
}

export function resetCallV4RemoteTerminalClaimsForTests(): void {
  remoteTerminalFinalized.clear();
  finalizedCallV4Ids.clear();
}

export async function callV4End(callId: string, router?: CallV4Router): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  clearCallV4MissedTimer(sid);
  if (!claimCallV4EndPatchOnce(sid)) return;
  useCallV4Store.getState().setPhase("ending");
  stopCallV4CallerActivePoll();
  const identity = readCallV4Identity();
  await callV4PatchEnd(sid);
  notifyCallV4PeerTerminalBestEffort(sid, identity, "ended");
  await finalizeCallV4Terminal(sid, "ended", router);
}
