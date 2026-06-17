import { isAuthBootstrapInitialSessionDone } from "@/lib/auth/auth-bootstrap-state";
import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";
import {
  isGuestAuthEstablished,
  logGuestFetchSkipped,
  noteGuest401,
} from "@/lib/auth/guest-auth-state";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
} from "@/lib/runtime/samarket-runtime-debug";
import { isLikelyFetchAbortError, logFetchClientTelemetry } from "@/lib/http/fetch-client-telemetry";

/** `docs/messenger-realtime-policy.md` 표 — GET `/api/auth/session` 합류 키 */
const SESSION_GET_FLIGHT = "client:GET:/api/auth/session";

const SESSION_401_RETRY_MS = 160;
/** Supabase `INITIAL_SESSION` 전에 GET 하면 일시 401 — WebView cold start 대비 */
const SESSION_PREFETCH_WAIT_MS = 1_200;
/** 서버 `auth-session-response-cache` TTL 과 맞춤 — 동일 탭 연속 session 검사 왕복 제거 */
const SESSION_CLIENT_OK_TTL_MS = 3_000;

let sessionOkClientCache: { expiresAt: number } | null = null;

function peekAuthSessionClientCacheHit(): boolean {
  return !!sessionOkClientCache && sessionOkClientCache.expiresAt > Date.now();
}

function setAuthSessionClientCacheOk(): void {
  sessionOkClientCache = { expiresAt: Date.now() + SESSION_CLIENT_OK_TTL_MS };
}

export function clearAuthSessionClientCache(): void {
  sessionOkClientCache = null;
}

/**
 * 여러 클라이언트 컴포넌트가 동시에 세션을 확인할 때 요청을 하나로 합칩니다.
 * (레이아웃·게이트·리다이렉트·로그인 직후 동기화 등이 같은 틱에 겹칠 때 대기 시간·부하 감소)
 */
export function fetchAuthSessionNoStore(clientCallSource?: string): Promise<Response> {
  if (isGuestAuthEstablished()) {
    logGuestFetchSkipped("GET:/api/auth/session", clientCallSource ?? "fetchAuthSessionNoStore");
    return Promise.resolve(
      new Response(JSON.stringify({ ok: false, authenticated: false }), {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-samarket-guest-auth-skip": "1",
          ...(clientCallSource ? { "x-samarket-client-call-source": clientCallSource } : {}),
        },
      })
    );
  }
  if (peekAuthSessionClientCacheHit()) {
    bumpAppWidePerf("auth_session_resolve_success");
    recordAppWidePhaseLastMs("auth_session_resolve_ms", 0);
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, authenticated: true }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-samarket-session-client-cache-hit": "1",
          ...(clientCallSource ? { "x-samarket-client-call-source": clientCallSource } : {}),
        },
      })
    );
  }
  return runSingleFlight(SESSION_GET_FLIGHT, async () => {
    if (peekAuthSessionClientCacheHit()) {
      return new Response(JSON.stringify({ ok: true, authenticated: true }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-samarket-session-client-cache-hit": "1",
        },
      });
    }
    bumpAppWidePerf("auth_session_resolve_start");
    const t0 = performance.now();
    await awaitClientSupabaseSessionReady(SESSION_PREFETCH_WAIT_MS);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
          headers: clientCallSource ? { "x-samarket-client-call-source": clientCallSource } : undefined,
        });
        if (res.ok) {
          setAuthSessionClientCacheOk();
        } else if (res.status === 401) {
          clearAuthSessionClientCache();
        }
        if (res.status === 401 && attempt === 0) {
          logFetchClientTelemetry("auth_401", {
            auth_401_url: "/api/auth/session",
            auth_401_source: "fetchAuthSessionNoStore",
            attempt: attempt + 1,
          });
          await new Promise((r) => setTimeout(r, SESSION_401_RETRY_MS));
          continue;
        }
        if (res.status === 401) {
          if (isAuthBootstrapInitialSessionDone()) {
            noteGuest401(clientCallSource ?? "fetchAuthSessionNoStore", {
              url: "/api/auth/session",
            });
          } else if (typeof console !== "undefined" && typeof console.info === "function") {
            console.info(
              "[guest-auth] guest_401_detected",
              JSON.stringify({
                at: Date.now(),
                source: clientCallSource ?? "fetchAuthSessionNoStore",
                url: "/api/auth/session",
                blocked_before_initial_session: true,
              }),
            );
          }
        }
        bumpAppWidePerf("auth_session_resolve_success");
        recordAppWidePhaseLastMs("auth_session_resolve_ms", Math.round(performance.now() - t0));
        return res;
      } catch (e) {
        if (isLikelyFetchAbortError(e, null)) {
          logFetchClientTelemetry("fetch_abort", {
            fetch_abort_url: "/api/auth/session",
            fetch_abort_reason: "abort_or_navigator_abort",
            fetch_abort_after_route_change: false,
          });
          throw e;
        }
        if (attempt === 0) {
          logFetchClientTelemetry("fetch_network_retry", {
            fetch_abort_url: "/api/auth/session",
            message: String(e instanceof Error ? e.message : e),
            attempt: 1,
          });
          await new Promise((r) => setTimeout(r, SESSION_401_RETRY_MS));
          continue;
        }
        throw e;
      }
    }
    throw new Error("fetchAuthSessionNoStore: exhausted attempts");
  });
}
