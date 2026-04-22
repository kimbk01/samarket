import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
} from "@/lib/runtime/samarket-runtime-debug";

/** `docs/messenger-realtime-policy.md` 표 — GET `/api/auth/session` 합류 키 */
const SESSION_GET_FLIGHT = "client:GET:/api/auth/session";

function documentHasSupabaseAuthCookies(): boolean {
  if (typeof document === "undefined") return false;
  const raw = document.cookie ?? "";
  if (!raw) return false;
  const chunks = raw.split("; ");
  for (const c of chunks) {
    const eq = c.indexOf("=");
    const name = eq >= 0 ? c.slice(0, eq) : c;
    if (!name) continue;
    if (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) {
      return true;
    }
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) {
      return true;
    }
  }
  return false;
}

/**
 * 여러 클라이언트 컴포넌트가 동시에 세션을 확인할 때 요청을 하나로 합칩니다.
 * (레이아웃·게이트·리다이렉트·로그인 직후 동기화 등이 같은 틱에 겹칠 때 대기 시간·부하 감소)
 */
export function fetchAuthSessionNoStore(): Promise<Response> {
  if (!documentHasSupabaseAuthCookies()) {
    return Promise.resolve(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
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
