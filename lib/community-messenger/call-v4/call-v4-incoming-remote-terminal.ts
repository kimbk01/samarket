"use client";

/**
 * 웹 V4 수신 중(incoming_ringing) 원격 종료 — 단일 확인 함수.
 * 설계: docs/audit/call-v4-web-incoming-remote-terminal-root-cause-design-2026-11-08.md §3
 * (Owner 「구현 승인」 2026-11-08, 통화 단독 커밋)
 *
 * 원인: 데스크톱 웹 V4 는 울리는 중 상대 종료를 받는 경로가 0개였다
 * (FCM·CallKit 은 앱 전용, 버스 종료 이벤트 발신자는 Legacy·V3 뿐, hangup broadcast 는 연결 중만 처리하고
 * 수신자가 종료를 실행한 경우 broadcast 자체가 오지 않는다).
 *
 * 기준은 서버 세션 상태 하나다. 전달 경로(T1 Realtime 행 변경 · T2 폴링 목록에서 빠짐 · T3 hangup broadcast)는
 * 모두 이 함수만 부르고, 이 함수는 서버 세션을 다시 읽어 확정된 경우에만 기존 `callV4HandleRemoteTerminal` 로 정리한다.
 * 정리 경로에는 서버 쓰기가 없다(상대 알림·PATCH 없음).
 */

import { callV4HandleRemoteTerminal } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";

const SERVER_TERMINAL_STATUSES = new Set(["cancelled", "canceled", "missed", "rejected", "ended", "failed"]);

export type CallV4IncomingRemoteTerminalResult =
  | "finalized"
  | "answered_elsewhere"
  | "still_ringing"
  | "not_current"
  | "unavailable"
  | "in_flight";

const confirmInFlight = new Set<string>();

/** 이 탭이 지금 이 통화를 「울리는 중」으로 보여 주고 있는가 (수락을 누르면 즉시 accepting 으로 바뀐다). */
export function isCurrentCallV4IncomingRinging(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  const identity = readCallV4Identity();
  return (
    readCallV4Phase() === "incoming_ringing" &&
    identity?.callId === sid &&
    identity.direction === "incoming"
  );
}

/**
 * 서버 세션을 다시 읽어 수신 중 통화가 끝났으면(취소·부재중·거절·종료·실패) 또는 다른 기기에서 받았으면(active)
 * 이 탭의 수신 화면을 정리한다. 서버가 아직 ringing 이거나 조회에 실패하면 아무것도 하지 않는다
 * (다음 전달 경로가 다시 부른다).
 */
export async function confirmCallV4IncomingRemoteTerminal(
  callId: string,
  source: string,
): Promise<CallV4IncomingRemoteTerminalResult> {
  const sid = callId.trim();
  if (!isCurrentCallV4IncomingRinging(sid)) return "not_current";
  if (confirmInFlight.has(sid)) return "in_flight";
  confirmInFlight.add(sid);
  try {
    const session = await callV4FetchSession(sid).catch(() => null);
    // 조회하는 동안 수락·거절·다른 정리가 일어났으면 손대지 않는다.
    if (!isCurrentCallV4IncomingRinging(sid)) return "not_current";
    const status = (session?.status ?? "").trim().toLowerCase();
    if (!status) {
      logCallV4("incoming_remote_terminal_unconfirmed", { callId: sid, source });
      return "unavailable";
    }
    if (status === "ringing") return "still_ringing";
    if (SERVER_TERMINAL_STATUSES.has(status)) {
      logCallV4("incoming_remote_terminal_confirmed", { callId: sid, status, source });
      await callV4HandleRemoteTerminal(sid, status, readCallV4ExitRouter() ?? undefined, source);
      return "finalized";
    }
    if (status === "active") {
      /**
       * 이 탭은 여전히 incoming_ringing 이다(수락을 누르면 동기적으로 accepting 이 된다) →
       * 다른 기기·탭에서 받은 통화. 안내는 기존 계약(`classifyCallTerminalReason`: answered_elsewhere → 안내 없음)을 따른다.
       * `mapCallV4RemoteTerminalReason("active")` = 중립 ended → NORMAL_ENDED → 안내 없음.
       */
      logCallV4("incoming_remote_terminal_answered_elsewhere", { callId: sid, source });
      await callV4HandleRemoteTerminal(sid, "active", readCallV4ExitRouter() ?? undefined, `${source}:answered_elsewhere`);
      return "answered_elsewhere";
    }
    logCallV4("incoming_remote_terminal_unknown_status", { callId: sid, status, source });
    return "unavailable";
  } finally {
    confirmInFlight.delete(sid);
  }
}

/** 테스트 전용 */
export function __resetCallV4IncomingRemoteTerminalForTests(): void {
  confirmInFlight.clear();
}
