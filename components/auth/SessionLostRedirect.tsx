"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SESSION_REPLACED_CODE, SESSION_REPLACED_MESSAGE } from "@/lib/auth/active-session-shared";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { isAppBootReady, peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import { isTerminalAuthSessionCode } from "@/lib/auth/is-terminal-auth-session-failure";
import {
  runAuthLogoutExit,
  runAuthSessionExpiredExit,
} from "@/lib/auth/auth-exit-coordinator";

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
 * 세션 정합 확인 — 터미널 401·세션 교체 시 정리 후 safe redirect.
 * 일시 401(레이스·네트워크)은 refresh·재시도 후에도 account-dependent 경로에서만 강제 정리.
 */
export function SessionLostRedirect() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);
  const prevPathForSessionRef = useRef<string | null>(null);
  const lastCheckAtRef = useRef(0);
  const [sessionReplacedOpen, setSessionReplacedOpen] = useState(false);

  const finalizeForcedLogout = useCallback(async () => {
    await runAuthLogoutExit();
    setSessionReplacedOpen((prev) => (prev ? false : prev));
  }, []);

  const finalizeSessionExpired = useCallback(async () => {
    await runAuthSessionExpiredExit();
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

            if (isTerminalAuthSessionCode(code)) {
              await finalizeSessionExpired();
              return;
            }

            if (attempt < SESSION_UNAUTH_MAX_ATTEMPTS - 1) {
              const sb = getSupabaseClient();
              try {
                if (sb) {
                  const refreshed = await runBrowserAuthRefreshDeduped(sb, "session_lost_redirect");
                  const refreshErr = refreshed.error as { code?: string; message?: string } | null;
                  if (refreshErr && isTerminalAuthSessionCode(String(refreshErr.code ?? refreshErr.message ?? ""))) {
                    await finalizeSessionExpired();
                    return;
                  }
                }
              } catch {
                /* ignore */
              }
              await new Promise((r) => setTimeout(r, 280 + attempt * 120));
              continue;
            }

            if (isAccountDependentPath(path)) {
              await finalizeSessionExpired();
            }
            return;
          }
        } catch {
          /** 네트워크 끊김 등 */
        }
      })()
    );
  }, [finalizeSessionExpired]);

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
