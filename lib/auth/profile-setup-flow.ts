import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { isCommunityHomeSurfacePath, isHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

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
 * 내정보 홈 — 세션당 1회 가입 안내는 이 화면에 있으면 「본 것」으로 기록만 한다(`mark_seen`).
 * 안내 목적지는 2026-11-20 부터 가입 단계 화면(`dibay-registration-steps`).
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
  if (isRegistrationGateOnlyExcludedPath(p)) return "none";
  /**
   * 탭 첫 화면에서만 안내한다 — 푸시·링크로 바로 들어온 채팅방·글·주문 화면은 그대로 연다(설계 2026-11-21 §5-5).
   * 1회 표식을 남기지 않으므로 나중에 탭 첫 화면에 오면 그때 1회 안내.
   */
  if (!isRegistrationPromptEntryPath(p)) return "none";
  return "redirect";
}

/**
 * 세션당 1회 가입 안내를 띄우는 탭 첫 화면 (하단 탭 루트).
 * 홈·커뮤니티 허브 루트(`/`·`/home`·`/philife`·`/community`)는 경로 SSOT `resolve-main-surface` 판정을 쓴다.
 */
const REGISTRATION_PROMPT_OTHER_TAB_ROOTS: readonly string[] = [
  "/market",
  "/stores",
  "/community-messenger",
  "/orders",
  "/services",
];

export function isRegistrationPromptEntryPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  if (isHomeSurfacePath(p) || isCommunityHomeSurfacePath(p)) return true;
  return REGISTRATION_PROMPT_OTHER_TAB_ROOTS.includes(p);
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

/** 통화 화면 — 세션당 1회 가입 안내가 통화 화면을 덮지 않게 */
export function isCallSurfacePath(pathname: string): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return ["/community-messenger/calls", "/community-messenger/calls-v3", "/community-messenger/calls-v4"].some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

/**
 * 세션당 1회 가입 안내만 건너뛰는 경로 — 가입 단계 화면 자신(`/auth/*`) · 통화 화면(받은 통화를 덮지 않는다, 설계 v3 §4-5).
 * 동의 게이트(`isDibaySignupGateExcludedPath`)에는 넣지 않는다 — 동의 게이트 동작은 바꾸지 않는다.
 */
export function isRegistrationGateOnlyExcludedPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p.startsWith("/auth/") || isCallSurfacePath(p);
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
