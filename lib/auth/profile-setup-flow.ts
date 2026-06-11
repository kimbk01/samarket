import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { MYPAGE_PROFILE_EDIT_HREF, isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import {
  isMypageAddressFlowPath,
} from "@/lib/addresses/mypage-addresses-return-to";

export const PROFILE_SETUP_QUERY = "setup" as const;
export const PROFILE_SETUP_VALUE = "1" as const;

export type ProfileSetupHrefOptions = {
  next?: string | null;
};

/**
 * 로그인 직후·주소 게이트 — 프로필 수정 setup 화면 URL.
 * `next` 는 setup 완료 후 돌아갈 내부 경로(검증 통과 시만 부착).
 */
export function buildProfileSetupHref(opts?: ProfileSetupHrefOptions): string {
  const params = new URLSearchParams();
  params.set(PROFILE_SETUP_QUERY, PROFILE_SETUP_VALUE);
  const safeNext = sanitizeNextPath(opts?.next ?? null);
  if (safeNext) {
    params.set("next", safeNext);
  }
  return `${MYPAGE_PROFILE_EDIT_HREF}?${params.toString()}`;
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
