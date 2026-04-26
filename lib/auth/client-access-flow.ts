"use client";

import { SESSION_REPLACED_CODE, SESSION_REPLACED_MESSAGE } from "@/lib/auth/active-session-shared";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import type { Profile } from "@/lib/types/profile";
import {
  bypassesPhilippinePhoneVerificationGate,
} from "@/lib/auth/member-access";
import { hasStoreTermsConsent, STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";

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
  return `/my/account/phone-verification?next=${encodeURIComponent(target)}`;
}

export function buildConsentHref(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/auth/consent?next=${encodeURIComponent(target)}`;
}

export function isLoginRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "").toLowerCase();
  return msg.includes("로그인이 필요") || msg.includes("unauthorized");
}

export function isPhoneVerificationRequiredError(error: string | null | undefined): boolean {
  const msg = String(error ?? "");
  return (
    msg.includes(STORE_PHONE_GATE_MESSAGE) ||
    (msg.includes("전화번호") && msg.includes("인증")) ||
    (msg.includes("필리핀") && msg.includes("인증"))
  );
}

export function isSessionReplacedError(error: string | null | undefined): boolean {
  const msg = String(error ?? "");
  return msg.includes(SESSION_REPLACED_CODE) || msg.includes(SESSION_REPLACED_MESSAGE);
}

function confirmMove(message: string): boolean {
  if (typeof window === "undefined") return true;
  return window.confirm(message);
}

export function redirectForBlockedAction(
  router: RouterLike,
  error: string | null | undefined,
  next?: string
): boolean {
  if (isLoginRequiredError(error)) {
    if (confirmMove("로그인이 필요합니다.\n로그인 화면으로 이동하시겠습니까?")) {
      router.push(buildLoginHref(next));
    }
    return true;
  }
  if (isPhoneVerificationRequiredError(error)) {
    if (confirmMove("정회원 인증이 필요합니다. 필리핀 전화번호 인증 후 이용할 수 있습니다.\n인증 화면으로 이동하시겠습니까?")) {
      router.push(buildPhoneVerificationHref(next));
    }
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
    if (confirmMove("로그인이 필요합니다.\n로그인 화면으로 이동하시겠습니까?")) {
      router.replace?.(buildLoginHref(next)) ?? router.push(buildLoginHref(next));
    }
    return false;
  }
  if (!hasStoreTermsConsent(user)) {
    if (confirmMove("서비스 이용약관과 개인정보처리방침 동의가 필요합니다.\n동의 화면으로 이동하시겠습니까?")) {
      router.replace?.(buildConsentHref(next)) ?? router.push(buildConsentHref(next));
    }
    return false;
  }
  const phoneVerified = user.phone_verified === true || Boolean(user.phone_verified_at);
  if (!phoneVerified) {
    if (
      !bypassesPhilippinePhoneVerificationGate({
        role: user.role,
        phone_verified: false,
        auth_provider: user.provider ?? user.auth_provider,
        email: user.email,
      })
    ) {
      if (confirmMove("정회원 인증이 필요합니다. 필리핀 전화번호 인증 후 이용할 수 있습니다.\n인증 화면으로 이동하시겠습니까?")) {
        router.replace?.(buildPhoneVerificationHref(next)) ?? router.push(buildPhoneVerificationHref(next));
      }
      return false;
    }
  }
  return true;
}
