import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";

/**
 * 회원 가입 완료 = 약관 동의 + 전화 인증 + 대표 주소 (Owner 2026-11-20 「승인, 구현 진행」,
 * 설계 `docs/audit/auth-entry-phone-address-consent-design-2026-11-20.md` v3).
 *
 * - 순서 = 동의 → 전화 → 주소 (§2 — 동의 전 전화 OTP 는 결함 SG-06).
 * - 열람은 막지 않는다. 가입 진행 중 회원은 회원 행동(글쓰기·댓글·좋아요·채팅·주문·통화 걸기·친구 추가) 때
 *   빠진 단계로 안내된다 (`profile-requirements` · `requireAuthAction` · 서버 쓰기 게이트).
 * - `consentComplete`·`signupComplete`(= 동의) 는 그대로 — proxy 동의 게이트·D5 클레임·재동의가 거기에 묶여 있다.
 * - 판정 재사용: 동의 `hasStoreTermsConsent` · 전화 `hasVerifiedPhone` · 주소 `is_active AND is_default_master`.
 */
export type DibayRegistrationStep = "terms" | "phone" | "address";

export const REGISTRATION_STEP_ORDER: readonly DibayRegistrationStep[] = ["terms", "phone", "address"] as const;

export const DIBAY_REGISTRATION_STEP_PATH: Record<DibayRegistrationStep, string> = {
  terms: "/auth/onboarding/terms",
  phone: "/auth/onboarding/phone",
  address: "/auth/onboarding/address",
};

export type RegistrationFacts = {
  consentComplete: boolean;
  phoneVerified: boolean;
  addressComplete: boolean;
  /** 특권 관리자 — 동의·전화와 같은 기준으로 전부 면제 */
  isPrivilegedAdmin?: boolean;
};

export function nextRegistrationStep(facts: RegistrationFacts): DibayRegistrationStep | null {
  if (facts.isPrivilegedAdmin === true) return null;
  if (!facts.consentComplete) return "terms";
  if (!facts.phoneVerified) return "phone";
  if (!facts.addressComplete) return "address";
  return null;
}

export function isRegistrationComplete(facts: RegistrationFacts): boolean {
  return nextRegistrationStep(facts) === null;
}

/** 가입 단계 화면 경로(+ next) — 단계가 없으면 null */
export function registrationStepHref(step: DibayRegistrationStep | null, next?: string | null): string | null {
  if (!step) return null;
  return withNextSearchParam(DIBAY_REGISTRATION_STEP_PATH[step], sanitizeNextPath(next ?? null));
}

export function isRegistrationStepPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return REGISTRATION_STEP_ORDER.some((s) => p === DIBAY_REGISTRATION_STEP_PATH[s]);
}
