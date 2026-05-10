import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
} from "@/lib/runtime/samarket-runtime-debug";
import { isLikelyFetchAbortError, logFetchClientTelemetry } from "@/lib/http/fetch-client-telemetry";

/** `docs/messenger-realtime-policy.md` 표 — GET `/api/auth/session` 합류 키 */
const SESSION_GET_FLIGHT = "client:GET:/api/auth/session";

const SESSION_401_RETRY_MS = 160;

/**
 * 여러 클라이언트 컴포넌트가 동시에 세션을 확인할 때 요청을 하나로 합칩니다.
 * (레이아웃·게이트·리다이렉트·로그인 직후 동기화 등이 같은 틱에 겹칠 때 대기 시간·부하 감소)
 */
export function fetchAuthSessionNoStore(): Promise<Response> {
  return runSingleFlight(SESSION_GET_FLIGHT, async () => {
    bumpAppWidePerf("auth_session_resolve_start");
    const t0 = performance.now();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.status === 401 && attempt === 0) {
          logFetchClientTelemetry("auth_401", {
            auth_401_url: "/api/auth/session",
            auth_401_source: "fetchAuthSessionNoStore",
            attempt: attempt + 1,
          });
          await new Promise((r) => setTimeout(r, SESSION_401_RETRY_MS));
          continue;
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
