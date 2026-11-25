import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { isAdminSetPasswordErrorKey, type AdminSetPasswordErrorKey } from "@/lib/auth/admin-set-password-policy";

/**
 * 관리자(스태프) 생성·수정·승격 실패 문구 — 비밀번호 오류는 `errorKey` 번역, 그 밖은 서버 코드 → 운영 문구(가입 후속 감사).
 * 서버 문장(`message`)을 그대로 보이지 않는다(영어 화면에 한국어 금지).
 */
export function adminStaffFailureText(
  failure: { error: string; errorKey?: string },
  t: (key: AdminSetPasswordErrorKey) => string,
  ko: boolean,
): string {
  if (isAdminSetPasswordErrorKey(failure.errorKey)) return t(failure.errorKey);
  return adminOperatorErrorMessage(failure.error, ko);
}
