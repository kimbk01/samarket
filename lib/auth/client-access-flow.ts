"use client";

import { SESSION_REPLACED_CODE, SESSION_REPLACED_MESSAGE } from "@/lib/auth/active-session-shared";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import type { Profile } from "@/lib/types/profile";
import {
  bypassesPhilippinePhoneVerificationGate,
} from "@/lib/auth/member-access";
import { openPhoneVerificationRequiredDialog } from "@/lib/auth/phone-verification-gate-client";
import { isPhoneVerificationRequiredError } from "@/lib/auth/phone-verification-required-detect";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";

type RouterLike = {
  push: (href: string) => void;
  replace?: (href: string) => void;
};

function currentHrefFallback(): string {
  if (typeof window === "undefined") return POST_LOGIN_PATH;
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 클라이언트에서 로그인 페이지로 보낼 때.
 * `next` 는 `sanitizeNextPath` 검증 후 안전한 내부 경로일 때만 부착된다.
 * (외부·`/login`·`/auth/callback` 등은 자동으로 떨어져 무한 루프를 막는다.)
 */
export function buildLoginHref(next?: string): string {
  return buildLoginPath(next);
}

export function buildPhoneVerificationHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/mypage/section/account/profile/edit?next=${encodeURIComponent(target)}`;
}

export function buildConsentHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/auth/consent?next=${encodeURIComponent(target)}`;
}

export function isLoginRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "").toLowerCase();
  return msg.includes("로그인이 필요") || msg.includes("unauthorized");
}

export { isPhoneVerificationRequiredError };

export function isSessionReplacedError(error: string | null | undefined): boolean {
  const msg = String(error ?? "");
  return msg.includes(SESSION_REPLACED_CODE) || msg.includes(SESSION_REPLACED_MESSAGE);
}

export function redirectForBlockedAction(
  router: RouterLike,
  error: string | null | undefined,
  next?: string
): boolean {
  if (isLoginRequiredError(error)) {
    openLoginRequiredSheet({ actionType: "messenger_open", next: next?.trim() || currentHrefFallback() });
    return true;
  }
  if (isPhoneVerificationRequiredError(error)) {
    openPhoneVerificationRequiredDialog({ next });
    return true;
  }
  return false;
}

export function ensureClientAccessOrRedirect(
  router: RouterLike,
  user: Profile | null | undefined,
  next?: string
): boolean {
  if (!user?.id) {
    openLoginRequiredSheet({ actionType: "profile_edit", next: next?.trim() || currentHrefFallback() });
    return false;
  }
  if (!hasStoreTermsConsent(user)) {
    const href = buildConsentHref(next);
    if (typeof router.replace === "function") {
      router.replace(href);
    } else {
      router.push(href);
    }
    return false;
  }
  const phoneVerified = user.phone_verified === true || Boolean(user.phone_verified_at);
  if (!phoneVerified) {
    if (
      !bypassesPhilippinePhoneVerificationGate({
        role: user.role,
        phone_verified: false,
        phone_verified_at: user.phone_verified_at ?? null,
        auth_provider: user.provider ?? user.auth_provider,
        provider: user.provider ?? user.auth_provider,
        email: user.email,
      })
    ) {
      openPhoneVerificationRequiredDialog({
        next: next?.trim() || currentHrefFallback(),
      });
      return false;
    }
  }
  return true;
}

/**
 * 프로필 캐시가 비어 있어도(동기화 레이스·일시 `getUser` 실패) 쿠키 세션이 살아 있으면 `/api/me/profile` 로 복구한 뒤 게이트를 통과시킨다.
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
      /* 세션 없음·네트워크 — 아래에서 동일 확인 대화상자 */
    }
  }
  return ensureClientAccessOrRedirect(router, user, next);
}
