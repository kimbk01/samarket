import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";

/** onboarding setup=1 — 전화·주소 포함 full ProfileEditForm */
const MYPAGE_PROFILE_SETUP_EDIT_HREF = "/mypage/section/account/profile/edit" as const;
import {
  isMypageAddressFlowPath,
} from "@/lib/addresses/mypage-addresses-return-to";

export const PROFILE_SETUP_QUERY = "setup" as const;
export const PROFILE_SETUP_VALUE = "1" as const;

export type ProfileSetupHrefOptions = {
  next?: string | null;
};

/**
 * 로그인 직후 필수정보(대표 주소·전화 인증) 미완료 회원의 강제 이동 목적지 = 내정보 홈.
 * 내정보 필수정보 카드에서 전화(시트)·대표 주소(`/mypage/addresses`)를 완료한다 (Owner 2026-11-09).
 */
export const PROFILE_SETUP_GATE_TARGET_HREF = "/mypage" as const;

export type ProfileSetupGateAction = "none" | "mark_seen" | "redirect";

/**
 * 필수정보 게이트 판정 — 로그인 세션당 1회.
 * - none: 이동 없음 (완료·이미 1회 처리·주소/프로필 흐름 중)
 * - mark_seen: 이미 내정보 홈 — 1회 처리로 기록만
 * - redirect: 내정보 홈으로 1회 이동 (호출부가 1회 처리로 기록)
 */
export function resolveProfileSetupGateAction(input: {
  needsBlock: boolean;
  deferredForSession: boolean;
  pathname: string | null | undefined;
}): ProfileSetupGateAction {
  if (!input.needsBlock || input.deferredForSession) return "none";
  const p = (input.pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  if (p === PROFILE_SETUP_GATE_TARGET_HREF || p === "/my") return "mark_seen";
  if (isProfileSetupGateExcludedPath(p)) return "none";
  return "redirect";
}

/**
 * 프로필 수정 setup 화면 URL (`?setup=1` 페이지 유지 — v3 X1). 자동 강제 이동에는 쓰지 않는다.
 * `next` 는 setup 완료 후 돌아갈 내부 경로(검증 통과 시만 부착).
 */
export function buildProfileSetupHref(opts?: ProfileSetupHrefOptions): string {
  const params = new URLSearchParams();
  params.set(PROFILE_SETUP_QUERY, PROFILE_SETUP_VALUE);
  const safeNext = sanitizeNextPath(opts?.next ?? null);
  if (safeNext) {
    params.set("next", safeNext);
  }
  return `${MYPAGE_PROFILE_SETUP_EDIT_HREF}?${params.toString()}`;
}

export function isProfileSetupMode(input: string | URLSearchParams | null | undefined): boolean {
  if (!input) return false;
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  return params.get(PROFILE_SETUP_QUERY) === PROFILE_SETUP_VALUE;
}

export type ProfileSetupCompleteInput = {
  /** `/api/me/mandatory-address-gate` 의 needsBlock — true 면 주소 미완 */
  needsBlock: boolean;
  phoneVerified: boolean;
};

export function isProfileSetupComplete(input: ProfileSetupCompleteInput): boolean {
  return input.needsBlock === false && input.phoneVerified === true;
}

export function isProfileSetupPending(input: ProfileSetupCompleteInput): boolean {
  return !isProfileSetupComplete(input);
}

/** setup 리다이렉트를 건너뛰는 경로 — 프로필 수정·주소 플로우·레거시 온보딩 */
export function isProfileSetupGateExcludedPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  if (!p) return false;
  if (isProfileEditPath(p)) return true;
  if (isMypageAddressFlowPath(p)) return true;
  if (p === "/address/select" || p.startsWith("/address/select/")) return true;
  if (p === "/my/addresses" || p.startsWith("/my/addresses/")) return true;
  if (p === "/onboarding/address" || p.startsWith("/onboarding/address/")) return true;
  if (p === "/mypage/logout" || p.startsWith("/mypage/logout/")) return true;
  if (p === "/my/logout" || p.startsWith("/my/logout/")) return true;
  return false;
}
