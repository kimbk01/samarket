"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { clearTestAuth, TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getSupabaseClient } from "@/lib/supabase/client";

const SESSION_CHECK_INTERVAL_MS = 90_000;

/** Supabase 세션이 없는데 (main) 셸이 남은 경우 → 로그인으로 강제 이동 (bfcache·클라 캐시 완화) */
const SESSION_CHECK_FLIGHT = "client:auth-session-check";

export function SessionLostRedirect() {
  const pathname = usePathname() ?? "";
  /** pathname 을 check·handleSessionLost 의 의존성에 넣지 않아, 라우트 전환마다 interval/focus 리스너가 재생성되지 않게 함 */
  const pathnameRef = useRef(pathname);

  const handleSessionLost = useCallback(async () => {
    clearTestAuth();
    setSupabaseProfileCache(null);
    try {
      const sb = getSupabaseClient();
      await sb?.auth.signOut();
    } catch {
      /* ignore */
    }
    const p = pathnameRef.current;
    const next = p && p !== "/login" ? `?next=${encodeURIComponent(p)}` : "";
    const url = `/login${next}`;
    if (typeof window !== "undefined") {
      window.location.replace(url);
    }
  }, []);

  const check = useCallback(async () => {
    if (typeof window === "undefined") return;
    const path = pathnameRef.current;
    if (path === "/login" || path.startsWith("/login/")) return;

    await runSingleFlight(SESSION_CHECK_FLIGHT, async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) return;
        /** 서버·게이트웨이 오류는 로그아웃으로 취급하지 않음(일시 장애로 세션 끊김 방지) */
        if (res.status >= 500 || res.status === 429) return;

        /** 401 등: 브라우저에서 refresh 한 번 시도 후 재검사 — 갱신 쿠키 반영 지연·Route Handler 쿠키 이슈 완화 */
        if (res.status === 401) {
          const sb = getSupabaseClient();
          try {
            await sb?.auth.refreshSession();
          } catch {
            /* ignore */
          }
          await new Promise((r) => setTimeout(r, 350));
          const res2 = await fetch("/api/auth/session", {
            credentials: "include",
            cache: "no-store",
          });
          if (res2.ok) return;
          if (res2.status >= 500 || res2.status === 429) return;
        }

        await handleSessionLost();
      } catch {
        /** 네트워크 끊김 등 — 자동 로그아웃 안 함 */
      }
    });
  }, [handleSessionLost]);

  /** 경로가 바뀔 때만 세션 확인(리스너·interval 은 아래 effect 에서 1회만 등록) */
  useLayoutEffect(() => {
    pathnameRef.current = pathname;
    void check();
  }, [pathname, check]);

  useRefetchOnPageShowRestore(() => void check(), { visibilityDebounceMs: 400 });

  useEffect(() => {
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check]);

  useEffect(() => {
    const t = window.setInterval(() => void check(), SESSION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [check]);

  useEffect(() => {
    const onAuth = () => void check();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [check]);

  return null;
}
