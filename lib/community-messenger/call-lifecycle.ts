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

import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import {
  playIncomingCallRingtone,
  stopCallRingtone,
} from "@/lib/community-messenger/call-ringtone-controller";
import {
  sealDibayCallTerminalSurface,
  shouldAllowDibayCallRoute,
} from "@/lib/community-messenger/call-orchestrator";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** INCOMING 레인 — 수신 벨 시작 */
export function dibayIncomingLaneStartRing(
  sessionId: string,
  callKind: CommunityMessengerCallKind
): void {
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  playIncomingCallRingtone(sessionId, callKind);
}

/** INCOMING 레인 — 수신 벨 중지 */
export function dibayIncomingLaneStopRing(reason: string, sessionId?: string | null): void {
  stopCallRingtone(reason, sessionId);
}

/** 모든 레인 — 통화 종료 확정 (terminal latch + pending route 삭제) */
export function dibayCallSealTerminal(sessionId: string | null | undefined): void {
  sealDibayCallTerminalSurface(sessionId);
}

/** ROUTE 레인 — 종료된 세션으로의 deep link 차단 */
export function dibayRouteLaneAllow(path: string): boolean {
  return shouldAllowDibayCallRoute(path);
}
