/**
 * 통화·메신저 클라이언트에서 공통으로 쓰는 사용자 노출 문구(한국어).
 * API `error` 코드 매핑은 서버 스키마와 맞출 것.
 */

export const MESSENGER_CALL_USER_MSG = {
  sessionActionFailed: "통화 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  sessionRejectFailed: "거절 처리에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
  incomingListFailed: "수신 통화 목록을 불러오지 못했습니다.",
  incomingListRetry: "다시 시도",
  networkOrServer: "네트워크 또는 서버 응답을 확인할 수 없습니다.",
  signalPollUnstable:
    "통화 신호 연결이 불안정합니다. 잠시만 기다리거나 통화를 종료한 뒤 다시 시도해 주세요.",
  groupRingEndFailed: "그룹 통화 호출 종료 요청에 실패했습니다.",
  groupCancelFailed: "통화 취소 요청에 실패했습니다.",
  groupEndFailed: "통화 종료 요청에 실패했습니다.",
  autoAcceptFailed: "자동 수락에 실패했습니다. 통화 안내에서 「수락」을 눌러 주세요.",
} as const;

export const SIGNAL_POLL_SOFT_ERROR = MESSENGER_CALL_USER_MSG.signalPollUnstable;
