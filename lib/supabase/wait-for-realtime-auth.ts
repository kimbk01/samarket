import type { SupabaseClient } from "@supabase/supabase-js";

/** 쿠키 세션 반영이 느린 환경(로컬·멀티 탭)에서도 한 번에 붙도록 기본 대기를 넉넉히 */
const DEFAULT_MAX_WAIT_MS = 10_000;

/**
 * Realtime `postgres_changes` 는 연결에 붙은 JWT 로 RLS 를 평가한다.
 * `@supabase/ssr` 브라우저 클라이언트는 쿠키에서 세션을 비동기로 채우므로,
 * `channel.subscribe()` 직전에 `access_token` 이 없으면 `onAuthStateChange` 로
 * 첫 유효 세션이 올 때까지 잠깐 대기한다.
 *
 * 그렇지 않으면 **채널은 SUBSCRIBED 인데 `auth.uid()` 가 비어** RLS SELECT 가
 * 모든 행을 막아 이벤트가 오지 않는다(UI 는 「실시간 연결됨」처럼 보일 수 있음).
 *
 * @returns 구독 직전에 `access_token` 이 있으면 true. 타임아웃까지 없으면 false — 이 경우
 *          곧바로 `postgres_changes` 를 붙이지 말고 재시도·`onAuthStateChange` 지연 구독을 권장.
 */
export async function waitForSupabaseRealtimeAuth(
  sb: SupabaseClient,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session?.access_token) return true;
  } catch {
    /* ignore */
  }

  return await new Promise<boolean>((resolve) => {
    let finished = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      try {
        clearTimeout(timer);
      } catch {
        /* ignore */
      }
      try {
        subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = setTimeout(() => {
      void sb.auth
        .getSession()
        .then(({ data: { session } }) => {
          finish(Boolean(session?.access_token));
        })
        .catch(() => finish(false));
    }, Math.max(200, maxWaitMs));

    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) finish(true);
    });
    subscription = data.subscription;
  });
}
