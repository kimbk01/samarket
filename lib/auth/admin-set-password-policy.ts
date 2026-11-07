/**
 * 어드민이 설정하는 비밀번호 규칙 — 단일 정의 (Owner 「설계안대로 확정」 2026-11-08, 설계안 ⑨).
 *
 * - 회원(관리자 생성 회원 포함): 6자 이상. 숫자만으로도 가능 (영문·기호도 허용).
 * - 관리자(스태프) 계정: 8자 이상 + 영문·숫자 각각 1자 이상.
 *
 * Supabase Auth 프로젝트 설정(최소 길이·필수 문자·유출 비밀번호 차단)은 프로젝트 전체에 걸리므로
 * 계정 종류별 차이는 앱이 이 모듈로만 강제한다. 회원 최소 길이 6 = Supabase 최소 길이 하한과 같게 둔다
 * (앱이 통과시키고 Supabase 가 거절하는 상황 방지).
 *
 * 클라이언트·서버 공용 (서버 전용 import 없음).
 */

export type AdminSetPasswordTarget = "member" | "staff";

export const MEMBER_PASSWORD_MIN_LENGTH = 6;
export const STAFF_PASSWORD_MIN_LENGTH = 8;
export const ADMIN_SET_PASSWORD_MAX_LENGTH = 128;

export type AdminSetPasswordRuleError = "password_min" | "password_too_long" | "password_staff_rule";

export type AdminSetPasswordCheck =
  | { ok: true }
  | { ok: false; error: AdminSetPasswordRuleError; messageKo: string };

export const ADMIN_SET_PASSWORD_COPY = {
  memberHint: `${MEMBER_PASSWORD_MIN_LENGTH}자 이상 · 숫자만으로도 가능`,
  memberMin: `비밀번호는 ${MEMBER_PASSWORD_MIN_LENGTH}자 이상 입력하세요. 숫자만으로도 됩니다.`,
  staffHint: `${STAFF_PASSWORD_MIN_LENGTH}자 이상 · 영문과 숫자 포함`,
  staffRule: `관리자 비밀번호는 ${STAFF_PASSWORD_MIN_LENGTH}자 이상이며 영문과 숫자를 모두 포함해야 합니다.`,
  tooLong: `비밀번호는 ${ADMIN_SET_PASSWORD_MAX_LENGTH}자 이하로 입력하세요.`,
  weakPwned: "유출된 비밀번호 목록에 있는 비밀번호라 Supabase 보안 설정이 거절했습니다. 다른 비밀번호를 입력하세요.",
  weakLength: "Supabase 최소 길이 설정보다 짧아 거절되었습니다. 더 길게 입력하세요.",
  weakCharacters: "Supabase 필수 문자 설정(영문 대·소문자·숫자·기호)에 맞지 않아 거절되었습니다.",
  weakGeneric: "Supabase 비밀번호 보안 설정이 이 비밀번호를 거절했습니다. 다른 비밀번호를 입력하세요.",
} as const;

export function adminSetPasswordHintKo(target: AdminSetPasswordTarget): string {
  return target === "staff" ? ADMIN_SET_PASSWORD_COPY.staffHint : ADMIN_SET_PASSWORD_COPY.memberHint;
}

export function adminSetPasswordMinLength(target: AdminSetPasswordTarget): number {
  return target === "staff" ? STAFF_PASSWORD_MIN_LENGTH : MEMBER_PASSWORD_MIN_LENGTH;
}

export function checkAdminSetPassword(
  password: string | null | undefined,
  target: AdminSetPasswordTarget,
): AdminSetPasswordCheck {
  const value = String(password ?? "");
  if (value.length > ADMIN_SET_PASSWORD_MAX_LENGTH) {
    return { ok: false, error: "password_too_long", messageKo: ADMIN_SET_PASSWORD_COPY.tooLong };
  }
  if (target === "staff") {
    const valid =
      value.length >= STAFF_PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
    return valid
      ? { ok: true }
      : { ok: false, error: "password_staff_rule", messageKo: ADMIN_SET_PASSWORD_COPY.staffRule };
  }
  if (value.length < MEMBER_PASSWORD_MIN_LENGTH) {
    return { ok: false, error: "password_min", messageKo: ADMIN_SET_PASSWORD_COPY.memberMin };
  }
  return { ok: true };
}

export type SupabaseWeakPasswordReason = "length" | "characters" | "pwned";

export type MappedWeakPassword = {
  error: "password_weak";
  reasons: SupabaseWeakPasswordReason[];
  messageKo: string;
};

/**
 * Supabase Auth `weak_password`(422) → 운영자가 바로 고칠 수 있는 한국어 사유.
 * 그 외 오류는 null (호출부가 기존 처리 유지).
 */
export function mapSupabaseWeakPasswordError(err: unknown): MappedWeakPassword | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; status?: unknown; message?: unknown; reasons?: unknown; weak_password?: unknown };
  const message = String(e.message ?? "");
  const isWeak =
    e.code === "weak_password" ||
    /known to be weak|easy to guess|password should/i.test(message) ||
    (e.status === 422 && /password/i.test(message));
  if (!isWeak) return null;

  const rawReasons = Array.isArray(e.reasons)
    ? e.reasons
    : Array.isArray((e.weak_password as { reasons?: unknown } | undefined)?.reasons)
      ? ((e.weak_password as { reasons: unknown[] }).reasons)
      : [];
  const reasons = rawReasons
    .map((r) => String(r))
    .filter((r): r is SupabaseWeakPasswordReason => r === "length" || r === "characters" || r === "pwned");
  if (reasons.length === 0) {
    if (/known to be weak|easy to guess/i.test(message)) reasons.push("pwned");
    else if (/at least \d+ characters/i.test(message)) reasons.push("length");
    else if (/should contain/i.test(message)) reasons.push("characters");
  }

  const messageKo = reasons.includes("pwned")
    ? ADMIN_SET_PASSWORD_COPY.weakPwned
    : reasons.includes("length")
      ? ADMIN_SET_PASSWORD_COPY.weakLength
      : reasons.includes("characters")
        ? ADMIN_SET_PASSWORD_COPY.weakCharacters
        : ADMIN_SET_PASSWORD_COPY.weakGeneric;

  return { error: "password_weak", reasons, messageKo };
}
