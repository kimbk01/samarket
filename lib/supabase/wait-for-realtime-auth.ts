import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_MAX_WAIT_MS = 4000;

/**
 * Realtime `postgres_changes` 는 연결에 붙은 JWT 로 RLS 를 평가한다.
 * `@supabase/ssr` 브라우저 클라이언트는 쿠키에서 세션을 비동기로 채우므로,
 * `channel.subscribe()` 직전에 `access_token` 이 없으면 `onAuthStateChange` 로
 * 첫 유효 세션이 올 때까지 잠깐 대기한다.
 *
 * 그렇지 않으면 **채널은 SUBSCRIBED 인데 `auth.uid()` 가 비어** RLS SELECT 가
 * 모든 행을 막아 이벤트가 오지 않는다(UI 는 「실시간 연결됨」처럼 보일 수 있음).
 */
export async function waitForSupabaseRealtimeAuth(
  sb: SupabaseClient,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<void> {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session?.access_token) return;
  } catch {
    /* ignore */
  }

  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        clearTimeout(timer);
      } catch {
        /* ignore */
      }
      try {
        subscription.unsubscribe();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const timer = setTimeout(finish, Math.max(200, maxWaitMs));

    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) finish();
    });
    const subscription = data.subscription;
  });
}
