"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SESSION_REPLACED_CODE, SESSION_REPLACED_MESSAGE } from "@/lib/auth/active-session-shared";
import { logoutDiBaYAppSession } from "@/lib/auth/logout";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { isAppBootReady, peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const SESSION_CHECK_COOLDOWN_MS = 10_000;
/** 라우트 전환 직후 쿠키·RSC 타이밍 레이스로 `/api/auth/session` 이 일시 401일 수 있음 — 즉시 검사하지 않음 */
const PATHNAME_SESSION_DEBOUNCE_MS = 500;
/** 매장 운영 허브 — App Boot·2차 API 이후 session 검사 */
const STORE_OWNER_SESSION_DEBOUNCE_MS = 2_800;

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
/** 401 시 refresh 후에도 몇 번 더 재시도(뒤로가기·빠른 전환 시 일시 실패 완화) */
const SESSION_UNAUTH_MAX_ATTEMPTS = 4;

const SESSION_CHECK_FLIGHT = "client:auth-session-check";

/** 커뮤니티 메신저 통화·발신 다이얼 — WebRTC·백그라운드 탭에서 세션 API 가 느리거나 실패하기 쉬움 */
function isCommunityMessengerCallShellPath(path: string): boolean {
  return path === "/community-messenger/calls" || path.startsWith("/community-messenger/calls/");
}

/**
 * 로그인/가입/OAuth 직후 세션 정합만 가볍게 확인한다.
 * - **자동 로그아웃·`/login` 강제 이동은 하지 않는다** — 의도적 세션 종료는 설정의 확인 모달 또는 세션 교체 안내의 확인만 사용 (`logoutDiBaYAppSession`).
 * - 뒤로가기 bfcache·탭 복귀마다 `/api/auth/session` 을 때리지 않는다(오탐·통화 중 끊김 방지).
 * - 실제 미인증은 `proxy.ts`·전체 네비게이션 시 서버가 처리.
 */
export function SessionLostRedirect() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);
  const prevPathForSessionRef = useRef<string | null>(null);
  const lastCheckAtRef = useRef(0);
  const [sessionReplacedOpen, setSessionReplacedOpen] = useState(false);

  const finalizeForcedLogout = useCallback(async () => {
    const result = await logoutDiBaYAppSession();
    if (result.ok) {
      setSessionReplacedOpen((prev) => (prev ? false : prev));
      if (typeof window !== "undefined") {
        window.location.replace(buildLoginPath());
      }
    }
  }, []);

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

    await runSingleFlight(SESSION_CHECK_FLIGHT, () =>
      (async (): Promise<void> => {
        try {
          for (let attempt = 0; attempt < SESSION_UNAUTH_MAX_ATTEMPTS; attempt++) {
            const res = await fetchAuthSessionNoStore("session_lost_redirect");
            if (res.ok) return;
            if (res.status >= 500 || res.status === 429) return;
            if (res.status === 403) return;
            if (res.status !== 401) return;

            let code = "";
            try {
              const body = (await res.clone().json()) as { code?: string };
              code = String(body?.code ?? "").trim();
            } catch {
              code = "";
            }
            if (code === SESSION_REPLACED_CODE) {
              setSessionReplacedOpen((prev) => (prev ? prev : true));
              return;
            }

            if (attempt < SESSION_UNAUTH_MAX_ATTEMPTS - 1) {
              const sb = getSupabaseClient();
              try {
                if (sb) await runBrowserAuthRefreshDeduped(sb, "session_lost_redirect");
              } catch {
                /* ignore */
              }
              await new Promise((r) => setTimeout(r, 280 + attempt * 120));
              continue;
            }
            /** 여기까지 401이면 네트워크·레이스·부하 가능성이 큼 — `signOut`·로그인 강제 이동 금지 */
            return;
          }
        } catch {
          /** 네트워크 끊김 등 */
        }
      })()
    );
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

  return sessionReplacedOpen ? (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <p className="sam-text-body font-semibold text-sam-fg">{t("auth_session_replaced")}</p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void finalizeForcedLogout()}
            className="w-full rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95"
          >
            {t("common_confirm")}
          </button>
        </div>
      </div>
    </div>
  ) : null;
}
