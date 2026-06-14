import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolvePostLoginRoute, type ResolvePostLoginRouteParams } from "@/lib/auth/resolve-post-login-route";
import { sanitizeFreshLoginLandingPath, sanitizeNextPath } from "@/lib/auth/safe-next-path";

export type { ResolvePostLoginRouteParams };

/**
 * 로그인 handoff `next` / 프로필 편집 `returnTo` — fresh login landing 검증.
 */
export function resolveSafeReturnTo(input?: string | null): string | null {
  return sanitizeFreshLoginLandingPath(sanitizeNextPath(input ?? null));
}

export function defaultPostLoginPath(): string {
  return POST_LOGIN_PATH;
}

/**
 * OAuth callback·native exchange·클라 fresh login 공통 post-login target.
 */
export function resolvePostLoginTarget(params: ResolvePostLoginRouteParams): string {
  return resolvePostLoginRoute(params);
}

export type ResolvePostLoginTargetFromStatusParams = {
  hasSession: boolean;
  status: OnboardingStatus | null;
  returnTo?: string | null;
  next?: string | null;
};

/** `returnTo` 우선, 없으면 `next` — 둘 다 safe landing 검증 후 resolve. */
export function resolvePostLoginTargetFromHandoff(
  params: ResolvePostLoginTargetFromStatusParams
): string {
  const handoff = params.returnTo ?? params.next ?? null;
  return resolvePostLoginTarget({
    hasSession: params.hasSession,
    status: params.status,
    next: handoff,
  });
}
