/**
 * 어드민 「비밀번호 관리」(임시 비밀번호 설정) 대상 판정 — 관리자 생성 회원만 (Owner 2026-11-08:
 * 「수동 회원만 변경하는 부분, 회원은 모두 auth(SNS) 로그인 회원가입」).
 *
 * 네이티브 SNS 회원도 Supabase 내부 로그인 방식은 `email`(내부 주소+파생 비밀번호)이라
 * identities 만 보면 비밀번호 회원처럼 보인다 — 그 값으로 판정하지 않는다.
 * 기준: SNS 연결(user_auth_identities)이 없고, 관리자 생성 표시(admin_manual) 또는 `@manual.local` 로그인 주소.
 */

import { MANUAL_MEMBER_EMAIL_SUFFIX } from "@/lib/auth/manual-member-email";

export type MemberPasswordEligibilityInput = {
  authUserPresent: boolean;
  /** Supabase Auth identity.provider 값 — 참고용 (네이티브 SNS 도 email 이라 판정 근거 아님) */
  identityProviders?: readonly (string | null | undefined)[];
  /** Supabase Auth 로그인 주소 */
  authEmail?: string | null;
  /** profiles.auth_login_email */
  profileAuthLoginEmail?: string | null;
  profileAuthProvider?: string | null;
  profileProvider?: string | null;
  /** user_auth_identities 의 SNS 제공자 (email 제외) */
  linkedSnsProviders?: readonly (string | null | undefined)[];
};

const SNS = new Set(["google", "kakao", "apple", "naver", "facebook"]);

function isManualLoginEmail(value: string | null | undefined): boolean {
  return String(value ?? "").trim().toLowerCase().endsWith(MANUAL_MEMBER_EMAIL_SUFFIX);
}

export function resolveMemberPasswordResetSupported(input: MemberPasswordEligibilityInput): boolean {
  if (!input.authUserPresent) return false;

  const linkedSns = (input.linkedSnsProviders ?? [])
    .map((p) => String(p ?? "").trim().toLowerCase())
    .filter((p) => SNS.has(p));
  if (linkedSns.length > 0) return false;

  const hint = String(input.profileAuthProvider || input.profileProvider || "").trim().toLowerCase();
  if (SNS.has(hint)) return false;
  if (hint === "admin_manual" || hint === "manual") return true;

  return isManualLoginEmail(input.authEmail) || isManualLoginEmail(input.profileAuthLoginEmail);
}
