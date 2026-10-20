/**
 * 탈퇴 요청 계약 (최종 설계 S19) — 클라이언트·API 가 같은 상수를 쓴다.
 *
 * 서버(`POST /api/me/leave-request`)는 `confirmationText === ACCOUNT_DELETION_CONFIRMATION_TOKEN` 을 요구한다
 * (`account_deletion_requests.confirmation_text` 저장값, API·DB 변경 0).
 * 내정보 탈퇴 화면은 단어 입력 대신 **확인 시트 승인** 시 이 상수를 보낸다.
 * 공개 삭제 요청 페이지(`/account/delete-request`, 스토어 정책용)는 기존 단어 입력을 그대로 쓴다.
 */
export const ACCOUNT_DELETION_CONFIRMATION_TOKEN = "계정삭제" as const;

export const ACCOUNT_DELETION_REASON_MAX = 2000;

export function isAccountDeletionConfirmationValid(text: unknown): boolean {
  return String(text ?? "").trim() === ACCOUNT_DELETION_CONFIRMATION_TOKEN;
}
