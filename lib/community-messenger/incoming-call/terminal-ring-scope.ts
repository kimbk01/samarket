import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import {
  matchIncomingCallSessionToTerminalQuery,
  type CallIncomingTerminalQuery,
} from "@/lib/community-messenger/call-incoming-terminal";
import { isCommunityMessengerTempCallSessionId } from "@/lib/community-messenger/call-session-navigation-seed";

/**
 * 종료 신호가 **현재 울리는 수신 벨**의 통화인지 판단 — 다른 통화의 지연된 종료 신호가 새 통화 벨을 끄지 않게 한다.
 *
 * 예전에는 종료 처리마다 `syncIncomingCallRing(null)` 로 "지금 울리는 벨"을 무조건 껐다.
 * 그래서 A 취소 직후 B 가 울리는 동안 A 의 늦은 종료 신호(push·폴링·Realtime 지연)가 도착하면 B 의 벨이 꺼졌다.
 *
 * 반환값 = 정지할 벨의 callId(= 현재 울리는 id) 또는 null(정지하지 않음).
 *
 * 판정(통화 식별 SSOT `matchIncomingCallSessionToTerminalQuery` 재사용):
 * - 실제 세션 id 가 있는 종료: 울리는 세션 id·tmp 별칭과 일치할 때만 정지. **다르면 정지하지 않는다**(확정 결함).
 * - `tmp_*` 별칭만 있는 종료(발신자가 생성 응답 전에 취소한 브로드캐스트):
 *   - 울리는 세션이 **다른** tmp 별칭을 갖고 있으면 → 다른 다이얼이 확실 → 정지하지 않음.
 *   - 울리는 세션에 tmp 별칭이 없거나 세션 행을 모르면 → 증명할 수 없으므로 **기존 동작 유지**
 *     (방·발신자·종류가 있으면 그것으로, 없으면 정지). "벨이 계속 울리는" 회귀를 만들지 않기 위함.
 * - id 가 없는 종료: 기존 동작 유지(방·발신자·종류 비교, 정보가 없으면 정지).
 */
export function resolveTerminalRingStopTarget(args: {
  activeRingCallId: string | null | undefined;
  /** 현재 울리는 세션 행(알면) — 수신 목록에서 activeRingCallId 로 찾은 것 */
  ringingSession?: CommunityMessengerCallSession | null;
  query: CallIncomingTerminalQuery;
}): string | null {
  const active = args.activeRingCallId?.trim() ?? "";
  if (!active) return null;
  const rawSid = args.query.sessionId?.trim() ?? "";
  const rawTmp = args.query.tmpSessionId?.trim() ?? "";
  /** sessionId 자리에 tmp 가 실려 온 경우(발신 tmp 단계 종료)는 tmp 별칭으로 취급 */
  const realSid = rawSid && !isCommunityMessengerTempCallSessionId(rawSid) ? rawSid : "";
  const tmpAlias = rawTmp || (rawSid && isCommunityMessengerTempCallSessionId(rawSid) ? rawSid : "");
  const ringing = args.ringingSession && args.ringingSession.id.trim() === active ? args.ringingSession : null;

  if (realSid) {
    if (ringing) return matchIncomingCallSessionToTerminalQuery(ringing, { ...args.query, sessionId: realSid }).match ? active : null;
    return realSid === active ? active : null;
  }

  if (tmpAlias) {
    if (tmpAlias === active) return active;
    if (ringing) {
      const ringingTmp = ringing.tmpSessionId?.trim() ?? "";
      if (ringingTmp) return ringingTmp === tmpAlias ? active : null;
      return decideOrKeepPrevious(matchesByRoomInitiatorKind(ringing, args.query), active);
    }
    return active;
  }

  if (ringing) return decideOrKeepPrevious(matchesByRoomInitiatorKind(ringing, args.query), active);
  return active;
}

/** undefined(판단 불가)일 때만 기존 동작(정지) — null(불일치)은 그대로 null */
function decideOrKeepPrevious(decision: string | null | undefined, active: string): string | null {
  return decision === undefined ? active : decision;
}

/** 방·발신자·종류가 모두 있으면 비교 결과(id|null), 하나라도 없으면 undefined(판단 불가) */
function matchesByRoomInitiatorKind(
  ringing: CommunityMessengerCallSession,
  query: CallIncomingTerminalQuery
): string | null | undefined {
  const room = query.roomId?.trim();
  const initiator = query.initiatorUserId?.trim();
  const kind = query.callKind;
  if (!room || !initiator || (kind !== "voice" && kind !== "video")) return undefined;
  return matchIncomingCallSessionToTerminalQuery(ringing, {
    sessionId: null,
    tmpSessionId: null,
    roomId: room,
    initiatorUserId: initiator,
    callKind: kind,
  }).match
    ? ringing.id.trim()
    : null;
}
