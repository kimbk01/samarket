"use client";

import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import type { Profile } from "@/lib/types/profile";
import {
  PHONE_VERIFICATION_REQUIRED_MESSAGE,
  bypassesPhilippinePhoneVerificationGate,
} from "@/lib/auth/member-access";

type RouterLike = {
  push: (href: string) => void;
  replace?: (href: string) => void;
};

function currentHrefFallback(): string {
  if (typeof window === "undefined") return POST_LOGIN_PATH;
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 클라이언트에서 로그인 페이지로 보낼 때 — `?next=` 미부착(프록시·세션만료와 동일).
 * 로그인 성공 후 이동은 로그인 페이지·`/auth/callback` 이 `POST_LOGIN_PATH` 로 통일.
 */
export function buildLoginHref(_next?: string): string {
  return "/login";
}

export function buildPhoneVerificationHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/my/account/phone-verification?next=${encodeURIComponent(target)}`;
}

export function isLoginRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "").toLowerCase();
  return msg.includes("로그인이 필요") || msg.includes("unauthorized");
}

export function isPhoneVerificationRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "");
  return (
    msg.includes(PHONE_VERIFICATION_REQUIRED_MESSAGE) ||
    (msg.includes("전화번호") && msg.includes("인증")) ||
    (msg.includes("필리핀") && msg.includes("인증"))
  );
}

export function redirectForBlockedAction(
  router: RouterLike,
  error: string | null | undefined,
  next?: string
): boolean {
  if (isLoginRequiredError(error)) {
    router.push(buildLoginHref(next));
    return true;
  }
  if (isPhoneVerificationRequiredError(error)) {
    router.push(buildPhoneVerificationHref(next));
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
    router.replace?.(buildLoginHref(next)) ?? router.push(buildLoginHref(next));
    return false;
  }
  if (user.phone_verified === false) {
    if (
      !bypassesPhilippinePhoneVerificationGate({
        role: user.role,
        phone_verified: false,
        auth_provider: user.auth_provider,
        email: user.email,
      })
    ) {
      router.replace?.(buildPhoneVerificationHref(next)) ?? router.push(buildPhoneVerificationHref(next));
      return false;
    }
  }
  return true;
}
