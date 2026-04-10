import { runSingleFlight } from "@/lib/http/run-single-flight";

const SESSION_GET_FLIGHT = "client:GET:/api/auth/session";

/**
 * 여러 클라이언트 컴포넌트가 동시에 세션을 확인할 때 요청을 하나로 합칩니다.
 * (레이아웃·게이트·리다이렉트 등이 같은 틱에 겹칠 때 대기 시간·부하 감소)
 */
export function fetchAuthSessionNoStore(): Promise<Response> {
  return runSingleFlight(SESSION_GET_FLIGHT, () =>
    fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    })
  );
}
