"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { clearTestAuth, getTestAuth, TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getSupabaseClient } from "@/lib/supabase/client";

const SESSION_CHECK_COOLDOWN_MS = 10_000;
/** 라우트 전환 직후 쿠키·RSC 타이밍 레이스로 `/api/auth/session` 이 일시 401일 수 있음 — 즉시 검사하지 않음 */
const PATHNAME_SESSION_DEBOUNCE_MS = 500;

function isAuthEntryPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/signup" ||
    path.startsWith("/signup/")
  );
}

/** 로그인·OAuth 콜백 직후 등 세션을 맞출 때만 경로 전환으로 session API 호출 */
function shouldRunSessionCheckAfterPathChange(prev: string | null, next: string): boolean {
  if (next === "/login" || next.startsWith("/login/")) return false;
  if (prev === null) return true;
  if (prev.startsWith("/auth/")) return true;
  if (isAuthEntryPath(prev)) return true;
  return false;
}
/** 401 시 refresh 후에도 몇 번 더 재시도(뒤로가기·빠른 전환 시 오탐 로그아웃 방지) */
const SESSION_UNAUTH_MAX_ATTEMPTS = 4;

/** Supabase 세션이 없는데 (main) 셸이 남은 경우 → 로그인으로 강제 이동 (bfcache·클라 캐시 완화) */
const SESSION_CHECK_FLIGHT = "client:auth-session-check";

export function SessionLostRedirect() {
  const pathname = usePathname() ?? "";
  /** pathname 을 check·handleSessionLost 의 의존성에 넣지 않아, 라우트 전환마다 interval/focus 리스너가 재생성되지 않게 함 */
  const pathnameRef = useRef(pathname);
  const prevPathForSessionRef = useRef<string | null>(null);
  const lastCheckAtRef = useRef(0);

  const handleSessionLost = useCallback(async () => {
    clearTestAuth();
    setSupabaseProfileCache(null);
    try {
      const sb = getSupabaseClient();
      await sb?.auth.signOut();
    } catch {
      /* ignore */
    }
    /** `?next=` 로 복귀하면 글쓰기 등 보호 경로로 바로 가며 세션·게이트와 어긋나 로그인 루프가 남 — 항상 `/login` 만 */
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
  }, []);

  const check = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    /** `test_users` 아이디 로그인은 Supabase 세션이 없어 `/api/auth/session` 이 항상 401 — Kasama·프록시와 동일하게 유지 */
    if (getTestAuth()) return;
    const path = pathnameRef.current;
    if (path === "/login" || path.startsWith("/login/")) return;
    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < SESSION_CHECK_COOLDOWN_MS) return;
    lastCheckAtRef.current = now;

    await runSingleFlight(SESSION_CHECK_FLIGHT, async () => {
      try {
        for (let attempt = 0; attempt < SESSION_UNAUTH_MAX_ATTEMPTS; attempt++) {
          const res = await fetchAuthSessionNoStore();
          if (res.ok) return;
          if (res.status >= 500 || res.status === 429) return;
          if (res.status === 403) return;
          if (res.status !== 401) return;

          if (attempt < SESSION_UNAUTH_MAX_ATTEMPTS - 1) {
            const sb = getSupabaseClient();
            try {
              await sb?.auth.refreshSession();
            } catch {
              /* ignore */
            }
            await new Promise((r) => setTimeout(r, 280 + attempt * 120));
            continue;
          }
          await handleSessionLost();
          return;
        }
      } catch {
        /** 네트워크 끊김 등 — 자동 로그아웃 안 함 */
      }
    });
  }, [handleSessionLost]);

  /**
   * `/home` ↔ `/chats` 등 일반 이동마다 `/api/auth/session` 을 때리지 않음(프록시·RSC 가 이미 인증 처리).
   * 로그인/가입/OAuth 직후에만 세션 정합 검사.
   */
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

    const t = window.setTimeout(() => {
      void check();
    }, PATHNAME_SESSION_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [pathname, check]);

  useRefetchOnPageShowRestore(() => void check(true), { visibilityDebounceMs: 400 });

  useEffect(() => {
    const onAuth = () => void check(true);
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [check]);

  return null;
}
