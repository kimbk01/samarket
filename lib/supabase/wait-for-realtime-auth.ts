import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime `postgres_changes` 는 연결에 붙은 JWT 로 RLS 를 평가한다.
 * `@supabase/ssr` 브라우저 클라이언트는 쿠키에서 세션을 비동기로 채우므로,
 * `channel.subscribe()` 직전에 `getSession()` 을 한 번 await 하지 않으면
 * SUBSCRIBED 직후에도 `auth.uid()` 가 비어 이벤트가 영구히 비는 레이스가 날 수 있다.
 */
export async function waitForSupabaseRealtimeAuth(sb: SupabaseClient): Promise<void> {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session?.access_token) return;
    await new Promise<void>((resolve) => {
      queueMicrotask(() => resolve());
    });
    await sb.auth.getSession();
  } catch {
    /* ignore */
  }
}
