import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
} from "@/lib/runtime/samarket-runtime-debug";

/** `docs/messenger-realtime-policy.md` 표 — GET `/api/auth/session` 합류 키 */
const SESSION_GET_FLIGHT = "client:GET:/api/auth/session";

/**
 * 여러 클라이언트 컴포넌트가 동시에 세션을 확인할 때 요청을 하나로 합칩니다.
 * (레이아웃·게이트·리다이렉트·로그인 직후 동기화 등이 같은 틱에 겹칠 때 대기 시간·부하 감소)
 */
export function fetchAuthSessionNoStore(): Promise<Response> {
  return runSingleFlight(SESSION_GET_FLIGHT, async () => {
    bumpAppWidePerf("auth_session_resolve_start");
    const t0 = performance.now();
    const res = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    });
    bumpAppWidePerf("auth_session_resolve_success");
    recordAppWidePhaseLastMs("auth_session_resolve_ms", Math.round(performance.now() - t0));
    return res;
  });
}
