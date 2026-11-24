/**
 * 가입 관문 — 로그인한 회원이 가입(동의 + 전화 인증 + 대표 주소)을 마치지 않았으면 빠진 단계 화면으로만 보낸다.
 * 단일 정의 `docs/audit/registration-ssot-redesign-2026-11-24.md` §3 (Owner 2026-11-24 「설계대로 진행」).
 *
 * - 비로그인은 대상이 아니다(읽기 가능 — `guest-browse-access-policy` 그대로).
 * - 건너뛰기·「세션당 1회」 없음: 예외 경로가 아니면 화면 이동마다 같은 판정.
 * - 목적지는 항상 빠진 단계 화면(+ 원래 화면 `next`). 내정보(`/mypage`)로 보내지 않는다
 *   — 2026-06-21 「/mypage 가 방·통화 deep route 를 덮음」 사고 조건(`cm-hub-navigation-contract`).
 * - 통화 화면은 덮지 않는다(받은 통화·진행 중 통화). 동의 관문 예외는 바꾸지 않는다(통화 규정 — 동작 불변).
 *
 * SSOT_CONTRACT: dibay-registration-gate-step-destination isRegistrationGateExemptPath resolveRegistrationGateTarget
 */
import { isClientSignupGateExemptPath } from "@/lib/auth/client-signup-gate";
import { registrationStepHref, type DibayRegistrationStep } from "@/lib/auth/dibay-registration-steps";
import { isCallSurfacePath } from "@/lib/auth/profile-setup-flow";

function pathOnly(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

/** 가입 관문 예외 — 동의 관문 예외(로그인·`/auth/*`·약관 문서·고객센터·탈퇴·주소/프로필 편집 흐름) + 통화 화면 */
export function isRegistrationGateExemptPath(pathname: string | null | undefined): boolean {
  const p = pathOnly(pathname);
  if (isClientSignupGateExemptPath(p)) return true;
  return isCallSurfacePath(p);
}

/**
 * 빠진 단계(전화·주소)가 있으면 그 단계 화면 경로, 없거나 예외 경로면 null.
 * 동의(terms)는 동의 관문이 같은 화면(`/auth/onboarding/terms`)으로 보낸다.
 */
export function resolveRegistrationGateTarget(input: {
  step: DibayRegistrationStep | null;
  pathname: string | null | undefined;
  /** 원래 화면 — 단계를 마치면 돌아간다 (경로 + 검색어) */
  returnTo?: string | null;
}): string | null {
  if (input.step !== "phone" && input.step !== "address") return null;
  if (isRegistrationGateExemptPath(input.pathname)) return null;
  return registrationStepHref(input.step, input.returnTo ?? input.pathname ?? null);
}
