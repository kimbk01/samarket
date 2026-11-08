import type { AppLanguageCode } from "@/lib/i18n/config";

/**
 * 탈퇴 요청 계약 (최종 설계 S19 · 언어 SSOT S2) — 클라이언트·API 가 같은 상수를 쓴다.
 *
 * - 확인어는 **화면 언어별** 한 곳에서만 정한다: ko `계정삭제` · en `DELETE`.
 *   공개 삭제 요청 페이지(`/account/delete-request`)는 지금 화면 언어의 확인어를 입력받는다.
 * - 서버(`POST /api/me/leave-request`)는 두 언어 확인어 중 하나와 정확히 같으면 통과
 *   (입력 도중 언어를 바꿔도 거부하지 않는다). 저장값은 입력한 확인어 그대로(`account_deletion_requests.confirmation_text`).
 * - 내정보 탈퇴 화면은 단어 입력 대신 **확인 시트 승인** 시 `ACCOUNT_DELETION_CONFIRMATION_TOKEN` 을 보낸다.
 * - 서버 오류 응답은 코드만 보낸다(`confirmation_invalid` 등). 화면 문구는 클라이언트 카탈로그가 정한다.
 */
export const ACCOUNT_DELETION_CONFIRMATION_WORDS = {
  ko: "계정삭제",
  en: "DELETE",
} as const satisfies Record<AppLanguageCode, string>;

/** 내정보 탈퇴 확인 시트 승인 시 보내는 값 */
export const ACCOUNT_DELETION_CONFIRMATION_TOKEN = ACCOUNT_DELETION_CONFIRMATION_WORDS.ko;

export const ACCOUNT_DELETION_REASON_MAX = 2000;

export function accountDeletionConfirmationWord(lang: AppLanguageCode): string {
  return ACCOUNT_DELETION_CONFIRMATION_WORDS[lang];
}

export function isAccountDeletionConfirmationValid(text: unknown): boolean {
  const s = String(text ?? "").trim();
  return (Object.values(ACCOUNT_DELETION_CONFIRMATION_WORDS) as string[]).includes(s);
}
