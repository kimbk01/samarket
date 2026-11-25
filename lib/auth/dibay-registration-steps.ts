import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";

/**
 * 회원 가입 완료 = 약관 동의 + 전화 인증 + 대표 주소 (Owner 2026-11-20 「승인, 구현 진행」,
 * 설계 `docs/audit/auth-entry-phone-address-consent-design-2026-11-20.md` v3).
 *
 * - 순서 = 동의 → 전화 → 주소 (§2 — 동의 전 전화 OTP 는 결함 SG-06).
 * - 비로그인은 열람 가능. 로그인했지만 가입을 마치지 않은 회원은 화면 이동마다 빠진 단계 화면으로 간다(건너뛰기 없음,
 *   2026-11-24 가입 SSOT — `registration-gate` · proxy). 통화 화면은 예외. 서버 쓰기 게이트가 최후 방어.
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

/** 가입 단계를 마친 뒤 돌아갈 곳이 없을 때 — 앱 홈 (설계 2026-11-24 §3 「next 없으면 홈」, 내정보 아님) */
export const REGISTRATION_DONE_DEFAULT_PATH = "/" as const;

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

/**
 * 가입 흐름의 「돌아갈 화면」 단일 판정 (전체 감사 A3·A5, 2026-11-25) — 약관 동의 화면 · 예전 동의 주소 · 동의 폼 · 단계 화면이 쓴다.
 * - 외부 이동 차단: `sanitizeNextPath`(역슬래시·제어문자·`//`·절대 URL 거부)
 * - 점 세그먼트(`/./x`, `/a/../x`)는 브라우저와 같게 정리한 뒤 판정 — 금지 경로 우회 차단
 * - 가입 단계 화면 · `/auth/*` · `/login*` 은 받지 않음(자기 자신·서로 반복 이동 차단)
 * - 없거나 거부되면 앱 홈 `REGISTRATION_DONE_DEFAULT_PATH`
 */
export function resolveRegistrationReturnPath(input: string | string[] | null | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const safe = sanitizeNextPath(typeof raw === "string" ? raw : null);
  if (!safe) return REGISTRATION_DONE_DEFAULT_PATH;
  let normalized = safe;
  try {
    const u = new URL(safe, "http://dibay.local");
    if (u.origin !== "http://dibay.local") return REGISTRATION_DONE_DEFAULT_PATH;
    normalized = `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return REGISTRATION_DONE_DEFAULT_PATH;
  }
  const again = sanitizeNextPath(normalized);
  if (!again) return REGISTRATION_DONE_DEFAULT_PATH;
  const p = again.split("?")[0] ?? again;
  if (isRegistrationStepPath(p) || p === "/auth" || p.startsWith("/auth/") || p === "/login" || p.startsWith("/login/")) {
    return REGISTRATION_DONE_DEFAULT_PATH;
  }
  return again;
}

export function isRegistrationStepPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return REGISTRATION_STEP_ORDER.some((s) => p === DIBAY_REGISTRATION_STEP_PATH[s]);
}
