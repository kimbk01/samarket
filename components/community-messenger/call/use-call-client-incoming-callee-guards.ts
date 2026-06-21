"use client";

import { useEffect, type MutableRefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  shouldClaimCallScreenSurfaceForCalleeAccept,
  shouldEjectCalleeFromRingingCallRoute,
} from "@/lib/community-messenger/call-client-incoming-boundary";
import { isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";
import {
  claimIncomingCallSurface,
  isIncomingCallSurfaceTerminal,
  releaseIncomingCallSurface,
} from "@/lib/community-messenger/incoming-call-surface-owner";
import { dismissAllIncomingCallNotificationsFireAndForget } from "@/lib/push/native/dismiss-native-incoming-call-notification";
import { exitCommunityMessengerCallRouteNow } from "@/lib/community-messenger/call-route-exit";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function isTerminalCallSessionStatus(status: CommunityMessengerCallSession["status"]): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "ended" ||
    normalized === "cancelled" ||
    normalized === "rejected" ||
    normalized === "missed" ||
    normalized === "failed" ||
    normalized === "declined"
  );
}

/**
 * 수신(callee) ringing 정책 전용 — Agora·Surface 렌더와 분리.
 * DO NOT: 통화 join/미디어 로직을 이 파일에 추가하지 않는다.
 */
export function useCallClientIncomingCalleeGuards(args: {
  sessionRef: MutableRefObject<CommunityMessengerCallSession | null>;
  session: CommunityMessengerCallSession | null;
  sessionId: string;
  requestedAction: string | null;
  incomingPreviewRoute: boolean;
  router: AppRouterInstance;
  busyRef: MutableRefObject<string | null>;
  calleeVideoConnectingShellRef: MutableRefObject<boolean>;
  autoRejectRef: MutableRefObject<boolean>;
  rejectIncoming: () => Promise<void>;
}): void {
  const {
    sessionRef,
    session,
    sessionId,
    requestedAction,
    incomingPreviewRoute,
    router,
    busyRef,
    calleeVideoConnectingShellRef,
    autoRejectRef,
    rejectIncoming,
  } = args;

  /** accept route 만 call_screen surface — 배너 단독 UI 유지 */
  useEffect(() => {
    const s = sessionRef.current;
    if (!s || s.isMineInitiator) return undefined;
    const sid = s.id.trim();
    if (!sid) return undefined;
    if (isIncomingCallSurfaceTerminal(sid) || isDibayCallConsumed(sid)) return undefined;
    if (
      !shouldClaimCallScreenSurfaceForCalleeAccept({
        isMineInitiator: s.isMineInitiator,
        status: s.status,
        requestedAction,
        calleeVideoConnectingShell: calleeVideoConnectingShellRef.current,
      })
    ) {
      return undefined;
    }
    claimIncomingCallSurface(sid, "call_screen", "call_client_incoming_ui");
    return () => {
      releaseIncomingCallSurface(sid, "call_screen", "call_client_incoming_ui_unmount");
    };
  }, [
    calleeVideoConnectingShellRef,
    requestedAction,
    session?.id,
    session?.isMineInitiator,
    session?.status,
    sessionId,
    sessionRef,
  ]);

  /** 수락 전 ringing callee `/calls/:id` 즉시 복귀 — IncomingCallView 전체화면 금지 */
  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (
      !shouldEjectCalleeFromRingingCallRoute({
        isMineInitiator: s.isMineInitiator,
        status: s.status,
        requestedAction,
        busyAccept: busyRef.current === "accept",
        calleeVideoConnectingShell: calleeVideoConnectingShellRef.current,
      })
    ) {
      return;
    }
    exitCommunityMessengerCallRouteNow({
      router,
      sessionId: s.id,
      roomId: s.roomId,
      target: "back",
      source: "callee_ringing_eject_guard",
    });
  }, [
    busyRef,
    calleeVideoConnectingShellRef,
    incomingPreviewRoute,
    requestedAction,
    router,
    session?.id,
    session?.isMineInitiator,
    session?.roomId,
    session?.status,
    sessionRef,
  ]);

  useEffect(() => {
    if (requestedAction !== "reject") return;
    const s = sessionRef.current;
    if (!s || s.id !== sessionId) return;
    if (s.isMineInitiator) return;
    if (s.status !== "ringing") {
      if (isTerminalCallSessionStatus(s.status)) {
        dismissAllIncomingCallNotificationsFireAndForget(s.id);
      }
      return;
    }
    if (autoRejectRef.current) return;
    autoRejectRef.current = true;
    void rejectIncoming().finally(() => {
      autoRejectRef.current = false;
    });
  }, [
    autoRejectRef,
    rejectIncoming,
    requestedAction,
    session?.id,
    session?.isMineInitiator,
    session?.status,
    sessionId,
    sessionRef,
  ]);
}
