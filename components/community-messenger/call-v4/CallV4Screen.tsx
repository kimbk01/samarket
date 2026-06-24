"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import {
  callV4Accept,
  callV4EnsureAgoraJoined,
  callV4HandleRejectRoute,
  hydrateCallV4CalleeScreen,
  startCallV4CallerActivePoll,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { tryStartCallV4NativeAcceptAutostart } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { exitCallV4ScreenAfterCleanup, registerCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { buildCallV4ScreenViewModel } from "@/lib/community-messenger/call-v4/call-v4-view-model";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

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
  const action = searchParams?.get("action")?.trim() ?? null;
  const source = searchParams?.get("source")?.trim() ?? null;
  const incomingPreview = searchParams?.get("incomingPreview") === "1";
  const exitGuardRef = useRef(false);

  useEffect(() => {
    if (!callId) return;
    logCallV4("screen_mounted", { callId, source });
    logCallV4("connecting_visible", { callId, source });
  }, [callId, source]);

  useEffect(() => {
    registerCallV4ExitRouter(router);
    return () => registerCallV4ExitRouter(null);
  }, [router]);

  useEffect(() => {
    if (!callId || action !== "accept") return;
    if (!tryStartCallV4NativeAcceptAutostart(callId)) return;
    void callV4Accept(callId, router, { skipRoute: true, source: source ?? "native" });
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

    if (exitGuardRef.current) return;
    exitGuardRef.current = true;

    let cancelled = false;
    void (async () => {
      const hydrated = await hydrateCallV4CalleeScreen(callId);
      if (cancelled) return;
      const after = readCallV4Identity();
      const afterPhase = readCallV4Phase();
      if (after?.callId === callId && CALL_V4_SCREEN_ACTIVE_PHASES.has(afterPhase)) {
        exitGuardRef.current = false;
        return;
      }
      if (afterPhase === "idle" || !after || after.callId !== callId) {
        logCallV4("screen_exit_stale_route", { callId, phase: afterPhase });
        exitCallV4ScreenAfterCleanup(router);
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
    let cancelled = false;
    void (async () => {
      await callV4EnsureAgoraJoined(callId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, identity?.callId, phase]);

  const vm = useMemo(
    () =>
      buildCallV4ScreenViewModel({
        callId,
        phase: phase === "idle" && action === "accept" ? "joining" : phase,
        identity,
        connectedAt,
        safeT: (key, options) => safeT(key as Parameters<typeof safeT>[0], options),
        router,
      }),
    [action, callId, phase, identity, connectedAt, safeT, router]
  );

  if (!vm) {
    return null;
  }

  return (
    <div data-testid="call-v4-screen" className="flex min-h-dvh flex-col bg-sam-app">
      <CallScreen vm={vm} variant="page" />
    </div>
  );
}
