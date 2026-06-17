import { getSupabaseClient } from "@/lib/supabase/client";

/** Supabase `INITIAL_SESSION`·쿠키 반영 전 API GET 이 일시 401 나는 레이스 완화 */
export async function awaitClientSupabaseSessionReady(maxWaitMs: number): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (data.session?.user?.id) return;

  await new Promise<void>((resolve) => {
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      /** guest cold start — `INITIAL_SESSION` null 도 bootstrap 완료 신호 */
      if (
        event === "INITIAL_SESSION" ||
        Boolean(session?.user?.id) ||
        event === "SIGNED_OUT"
      ) {
        window.clearTimeout(timer);
        subscription.unsubscribe();
        resolve();
      }
    });
    const timer = window.setTimeout(() => {
      subscription.unsubscribe();
      resolve();
    }, maxWaitMs);
  });
}
