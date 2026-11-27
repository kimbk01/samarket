/**
 * F4 (2026-11-27 · Owner 「승인, 구현 진행」) — 전화 OTP 는 약관·개인정보 동의 뒤 (계약 C4 B6 · SG-06).
 * 설계 `docs/audit/f4-otp-address-consent-design-2026-11-27.md` §4-1.
 *
 * OTP 라우트(`/api/account/phone/*` 는 회원 상태 EXEMPT 라 중앙 게이트를 건너뛴다)에서 세션 확인 직후,
 * 발송 한도·SMS 호출 전에 부른다. 판정은 중앙 게이트와 같은 `resolveMemberConsentAuthority` 하나.
 * - 동의(또는 특권 관리자) → null (통과)
 * - 미동의 → 403 `signup_incomplete` (step 없음 → 화면은 동의 화면 복구 `redirectForBlockedAction`)
 * - 판정 불가 → 503 `consent_state_unavailable` (fail-closed)
 * 서버 문장 없음 — 화면이 코드로 처리한다 (i18n SSOT).
 */
import { NextResponse } from "next/server";
import { resolveMemberConsentAuthority } from "@/lib/auth/resolve-member-consent-authority";

export const MEMBER_CONSENT_REQUIRED_CODE = "signup_incomplete" as const;
export const MEMBER_CONSENT_UNAVAILABLE_CODE = "consent_state_unavailable" as const;

export async function requireMemberConsent(userId: string): Promise<NextResponse | null> {
  const consent = await resolveMemberConsentAuthority(userId);
  if (consent.kind === "CONSENTED") return null;
  const code = consent.kind === "UNAVAILABLE" ? MEMBER_CONSENT_UNAVAILABLE_CODE : MEMBER_CONSENT_REQUIRED_CODE;
  return NextResponse.json(
    { ok: false, error: code, code, message: code, authenticated: true },
    { status: consent.kind === "UNAVAILABLE" ? 503 : 403 },
  );
}
