"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { isAppBootReady, peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import {
  runAuthSessionExpiredExit,
} from "@/lib/auth/auth-exit-coordinator";
import { ensureSessionHealthy } from "@/lib/auth/dibay-session-manager";

const SESSION_CHECK_COOLDOWN_MS = 10_000;
const PATHNAME_SESSION_DEBOUNCE_MS = 500;
const STORE_OWNER_SESSION_DEBOUNCE_MS = 2_800;

const SESSION_CHECK_FLIGHT = "client:auth-session-check";

function isAuthEntryPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/signup" ||
    path.startsWith("/signup/")
  );
}

function shouldRunSessionCheckAfterPathChange(prev: string | null, next: string): boolean {
  if (next === "/login" || next.startsWith("/login/")) return false;
  if (prev === null) return true;
  if (prev.startsWith("/auth/")) return true;
  if (isAuthEntryPath(prev)) return true;
  return false;
}

function isCommunityMessengerCallShellPath(path: string): boolean {
  return path === "/community-messenger/calls" || path.startsWith("/community-messenger/calls/");
}

/**
 * 세션 정합 확인 — terminal corrupt 확인 후에만 session_expired exit.
 */
export function SessionLostRedirect() {
  useI18n();
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);
  const prevPathForSessionRef = useRef<string | null>(null);
  const lastCheckAtRef = useRef(0);

  const check = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    const path = pathnameRef.current;
    if (path === "/login" || path.startsWith("/login/")) return;
    if (isCommunityMessengerCallShellPath(path)) return;
    if (!force && isStoreOwnerAdminPathname(path) && isAppBootReady() && peekAppBootProfile()) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < SESSION_CHECK_COOLDOWN_MS) return;
    lastCheckAtRef.current = now;

    await runSingleFlight(SESSION_CHECK_FLIGHT, async () => {
      try {
        const result = await ensureSessionHealthy("session_lost_redirect");
        if (result.ok) return;
        if (result.terminal && isAccountDependentPath(path)) {
          await runAuthSessionExpiredExit();
        }
      } catch {
        /* 네트워크 끊김 — logout 금지 */
      }
    });
  }, []);

  useLayoutEffect(() => {
    pathnameRef.current = pathname;
    const prev = prevPathForSessionRef.current;
    const next = pathname;

    if (next === "/login" || next.startsWith("/login/")) {
      prevPathForSessionRef.current = next;
      return;
    }

    const run = shouldRunSessionCheckAfterPathChange(prev, next);
    prevPathForSessionRef.current = next;
    if (!run) return;

    const debounceMs = isStoreOwnerAdminPathname(next)
      ? STORE_OWNER_SESSION_DEBOUNCE_MS
      : PATHNAME_SESSION_DEBOUNCE_MS;
    const t = window.setTimeout(() => {
      void check();
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [pathname, check]);

  useEffect(() => {
    const onAuth = () => void check(true);
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [check]);

  return null;
}
