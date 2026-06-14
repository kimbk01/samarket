"use client";

import { isAccountDependentPath, isAuthEntryPath } from "@/lib/auth/auth-route-classification";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";

export type AuthExitReason = "logout" | "session_expired" | "account_switch" | "auth_required";

function currentPathname(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export function resolveAuthExitHref(reason: AuthExitReason): string {
  const path = currentPathname();
  if (reason === "session_expired" || reason === "auth_required") {
    const q = reason === "session_expired" ? "session_expired" : "auth_required";
    return `/login?reason=${q}`;
  }
  if (reason === "logout") {
    return "/login?reason=logout";
  }
  if (reason === "account_switch" && isAccountDependentPath(path)) {
    return POST_LOGIN_PATH;
  }
  if (isAuthEntryPath(path)) {
    return "/login?reason=logout";
  }
  return "/login?reason=logout";
}

/** router.push 금지 — hard replace 만 (`navigateAfterAuthExitOnce` 가 중복 호출 방지) */
export function navigateAfterAuthExit(reason: AuthExitReason): void {
  if (typeof window === "undefined") return;
  const href = resolveAuthExitHref(reason);
  try {
    window.location.replace(href);
  } catch {
    window.location.href = href;
  }
}
