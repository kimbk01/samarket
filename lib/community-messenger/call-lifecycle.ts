"use client";

/**
 * DIBAY 통화 — 3 레인 (역할 겹치지 않음)
 *
 * | 레인 | 담당 컴포넌트 | 할 일 | 하지 말 것 |
 * |------|---------------|-------|------------|
 * | INCOMING | GlobalCommunityMessengerIncomingCall | 수신 목록·벨·배너 | Agora·라우트 replay |
 * | ACTIVE | CommunityMessengerCallClient | 미디어·조인·종료 PATCH | 수신 벨·글로벌 오버레이 |
 * | ROUTE | DibayFcmCallRouteHost | pending path → router | 벨·세션 fetch |
 *
 * 종료·stale route·벨 stop/start 는 이 모듈 API 만 사용한다.
 */

import { markCallRouteTerminal } from "@/lib/call/routing/call-route-latch";
import { clearCallPendingRoute } from "@/lib/call/routing/pending-call-route";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import {
  playIncomingCallRingtone,
  stopCallRingtone,
} from "@/lib/community-messenger/call-ringtone-controller";
import { shouldAllowDibayCallRoute } from "@/lib/community-messenger/call-orchestrator";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  setDibayCallSessionPhase,
  shouldAllowIncomingRingtone,
} from "@/lib/community-messenger/incoming-call-state";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { clearNativePersistedCallPendingRoute } from "@/lib/push/native/push-route-native-bridge";

/** INCOMING 레인 — 수신 벨 시작 (phase === incoming 일 때만) */
export function dibayIncomingLaneStartRing(
  sessionId: string,
  callKind: CommunityMessengerCallKind,
  source = "incoming_lane"
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  if (!shouldAllowIncomingRingtone(sid)) {
    logDibayCall("incoming_ignored_consumed", { sessionId: sid, callId: sid, source });
    return;
  }
  setDibayCallSessionPhase(sid, "incoming");
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  playIncomingCallRingtone(sid, callKind);
  logDibayCall("ring_start", { sessionId: sid, callId: sid, callKind, source });
}

/** INCOMING 레인 — 수신 벨 중지 */
export function dibayIncomingLaneStopRing(reason: string, sessionId?: string | null): void {
  stopCallRingtone(reason, sessionId);
}

/**
 * 모든 레인 — 통화 종료 확정.
 * terminal latch + route latch clear + Agora join guard + heartbeat + pending route 삭제.
 */
export function dibayCallSealTerminal(sessionId: string | null | undefined, now = Date.now()): void {
  const sid = sessionId?.trim();
  if (!sid) return;
  markCallRouteTerminal(sid, now);
  void import("@/lib/call/actions/agora-join-guard").then((m) => m.clearAgoraJoinGuard(sid));
  void import("@/lib/call/native/call-heartbeat-watchdog").then((m) => m.stopCallHeartbeatWatchdog(sid));
  if (typeof window === "undefined") return;
  clearCallPendingRoute();
  void clearNativePersistedCallPendingRoute();
}

/** ROUTE 레인 — 종료된 세션으로의 deep link 차단 */
export function dibayRouteLaneAllow(path: string): boolean {
  return shouldAllowDibayCallRoute(path);
}
