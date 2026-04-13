/**
 * 관리자「회원 수동 입력」·Auth 백필·로그인 보정에서 공통으로 쓰는 이메일 규칙.
 * 도메인/접미사를 한곳만 바꾸면 UI·API·로그인이 함께 따라가게 한다.
 */

export const MANUAL_MEMBER_EMAIL_DOMAIN = "manual.local" as const;

/** `@manual.local` — Auth `email`·`signInWithPassword` 에 넣는 값의 접미사 */
export const MANUAL_MEMBER_EMAIL_SUFFIX = `@${MANUAL_MEMBER_EMAIL_DOMAIN}` as const;

/**
 * 이메일 칸을 비운 채 수동 생성할 때 Supabase Auth에 저장되는 이메일.
 * 로그인 폼에 @ 없이 아이디만 넣어도 동일 주소로 보정된다(`resolveManualMemberSignInEmail`).
 */
export function buildManualMemberAuthEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase();
  return `${id}${MANUAL_MEMBER_EMAIL_SUFFIX}`;
}

/**
 * 로그인 페이지 이메일 칸: 실제 이메일은 그대로, @ 없으면 수동 회원 규칙으로 보정.
 */
export function resolveManualMemberSignInEmail(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  return buildManualMemberAuthEmail(t);
}
