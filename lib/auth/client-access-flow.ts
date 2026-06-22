"use client";

import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import type { Profile } from "@/lib/types/profile";
import { isPhoneVerificationRequiredError } from "@/lib/auth/phone-verification-required-detect";
import { isClientSignupComplete, profileToDibaySignupInput } from "@/lib/auth/client-signup-gate";
import { deriveDibaySignupStatus, resolveDibaySignupRoute } from "@/lib/auth/dibay-signup-status";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";
import { isAccountDependentPath, sanitizeLoginNextPath } from "@/lib/auth/auth-route-classification";

type RouterLike = {
  push: (href: string) => void;
  replace?: (href: string) => void;
};

function currentHrefFallback(): string {
  if (typeof window === "undefined") return POST_LOGIN_PATH;
  const href = `${window.location.pathname}${window.location.search}`;
  if (isAccountDependentPath(window.location.pathname)) {
    return POST_LOGIN_PATH;
  }
  return sanitizeLoginNextPath(href) ?? POST_LOGIN_PATH;
}

/**
 * 클라이언트에서 로그인 페이지로 보낼 때.
 * `next` 는 `sanitizeNextPath` 검증 후 안전한 내부 경로일 때만 부착된다.
 */
export function buildLoginHref(next?: string): string {
  return buildLoginPath(next);
}

export function buildPhoneVerificationHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/mypage/required/phone?returnTo=${encodeURIComponent(target)}`;
}

export function buildConsentHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/auth/onboarding/terms?next=${encodeURIComponent(target)}`;
}

export function buildDibayIdHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/mypage/required/dibay-id?returnTo=${encodeURIComponent(target)}`;
}

export function buildAddressEditHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/mypage/addresses?returnTo=${encodeURIComponent(target)}`;
}

export function buildProfileSetupHrefForNext(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/mypage?returnTo=${encodeURIComponent(target)}`;
}

export function resolveClientSignupGateHref(
  user: Profile,
  next?: string
): string {
  const status = deriveDibaySignupStatus(profileToDibaySignupInput(user), { hasSession: true });
  return resolveDibaySignupRoute(status, next?.trim() || currentHrefFallback());
}

export function isLoginRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "").toLowerCase();
  return msg.includes("로그인이 필요") || msg.includes("unauthorized");
}

export { isPhoneVerificationRequiredError };

export function redirectForBlockedAction(
  router: RouterLike,
  error: string | null | undefined,
  next?: string
): boolean {
  const returnNext = next?.trim() || currentHrefFallback();
  if (isLoginRequiredError(error)) {
    openLoginRequiredSheet({ actionType: "messenger_open", next: returnNext });
    return true;
  }
  if (isPhoneVerificationRequiredError(error)) {
    openPhoneVerificationRequiredSheet({ next: returnNext });
    return true;
  }
  void router;
  return false;
}

/**
 * 로그인 + 약관 동의만 확인. @id·프로필·전화·주소는 requireAuthAction / requireProfileCompletion.
 */
export function ensureClientAccessOrRedirect(
  router: RouterLike,
  user: Profile | null | undefined,
  next?: string
): boolean {
  if (!user?.id) {
    openLoginRequiredSheet({ actionType: "profile_edit", next: next?.trim() || currentHrefFallback() });
    return false;
  }
  if (!isClientSignupComplete(user)) {
    const href = resolveClientSignupGateHref(user, next);
    if (typeof router.replace === "function") {
      router.replace(href);
    } else {
      router.push(href);
    }
    return false;
  }
  return true;
}

/**
 * 프로필 캐시가 비어 있어도 쿠키 세션이 살아 있으면 `/api/me/profile` 로 복구한 뒤 게이트를 통과시킨다.
 */
export async function ensureClientAccessOrRedirectAsync(
  router: RouterLike,
  next?: string
): Promise<boolean> {
  let user = getCurrentUser();
  if (!user?.id && typeof window !== "undefined") {
    try {
      const row = await getMyProfile();
      if (row?.id) {
        user = profileRowToClientProfile(row);
        setSupabaseProfileCache(user);
      }
    } catch {
      /* 세션 없음·네트워크 */
    }
  }
  return ensureClientAccessOrRedirect(router, user, next);
}
