/**
 * 수신자에게 「부재중」인 통화 기록 판정 — 단일 정의 (Owner 2026-11-13 「발신 후 수신 전 취소 = 수신자 부재중」).
 *
 * 부재중 = 받지 않음(시간 초과 `missed`) 또는 **발신자가 응답 전 취소**(`cancelled` + 종료 사유 `canceled`/해석 이벤트
 * `cancelled_by_caller`) 를 발신자가 아닌 사람이 볼 때. 통화 중(`peer_busy`·`caller_busy`)·재발신 대체 등 다른 취소는 아니다.
 *
 * 쓰는 곳(같은 규칙 — docs/audit/call-cancel-callee-missed-design-2026-11-13.md D6):
 * - 서버 통화 기록 안 읽은 수 증가(`service.ts` C-N1) → `callStubIncrementsCalleeUnread`
 * - 앱 안 부재중 배너(`messenger-in-app-banner-content.ts`) → `isMissedCallStubForViewer`
 * - 실시간 통화 기록 수신음(`call-stub-receive-sound-policy.ts`) → `isMissedCallStubForViewer`
 * 화면 문구는 `call-event-presentation.ts` `resolveCallEventCanonical`(같은 규칙).
 *
 * 서버 전용 의존성이 없어야 한다(클라이언트에서도 import).
 */

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 발신자가 응답 전에 취소한 통화인가 (해석 이벤트 → 종료 사유 → 저장 상태 순). */
export function isCallerCancelledCallStub(input: {
  callStatus?: string | null;
  resolvedEvent?: string | null;
  endedReason?: string | null;
}): boolean {
  const ev = lower(input.resolvedEvent);
  if (ev) return ev === "cancelled_by_caller";
  if (lower(input.callStatus) !== "cancelled") return false;
  const er = lower(input.endedReason);
  if (er) return er === "canceled" || er === "cancelled";
  /** 사유·이벤트가 없는 옛 기록 — 화면 문구(resolveCallEventCanonical)와 같게 발신자 취소로 본다 */
  return true;
}

/** 보는 사람에게 부재중인 통화 기록인가. 발신자를 모르면(옛 기록) 통화 기록 보낸 사람(= 취소한 발신자)으로 대신한다. */
export function isMissedCallStubForViewer(input: {
  callStatus?: string | null;
  resolvedEvent?: string | null;
  endedReason?: string | null;
  viewerUserId?: string | null;
  initiatorUserId?: string | null;
  senderUserId?: string | null;
}): boolean {
  if (lower(input.callStatus) === "missed") return true;
  if (!isCallerCancelledCallStub(input)) return false;
  const viewer = trimId(input.viewerUserId);
  const caller = trimId(input.initiatorUserId) || trimId(input.senderUserId);
  if (!viewer || !caller) return false;
  return viewer !== caller;
}

/**
 * 서버 — 통화 기록이 받는 사람(보낸 사람 외 참여자) 안 읽은 수를 올리는가.
 * 부재중이거나, 발신자가 보낸(= 발신자가 취소한) 발신자 취소 기록일 때만. 받은·거절·다른 취소는 올리지 않는다(C-N1 유지).
 */
export function callStubIncrementsCalleeUnread(input: {
  status?: string | null;
  endedReason?: string | null;
  stubActorUserId?: string | null;
  initiatorUserId?: string | null;
}): boolean {
  if (lower(input.status) === "missed") return true;
  if (lower(input.status) !== "cancelled") return false;
  const er = lower(input.endedReason);
  if (er !== "canceled" && er !== "cancelled") return false;
  const actor = trimId(input.stubActorUserId);
  const initiator = trimId(input.initiatorUserId);
  return Boolean(actor) && Boolean(initiator) && actor === initiator;
}
