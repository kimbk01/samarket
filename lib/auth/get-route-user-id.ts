import { readKasamaDevUserIdFromRequest } from "@/lib/auth/kasama-session-cookies";
import { allowKasamaDevSession, isProductionDeploy } from "@/lib/config/deploy-surface";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

/**
 * Route Handler에서 현재 사용자 UUID.
 * 아이디 로그인(test_users) 쿠키(Kasama) 우선 → Supabase `getSession()`(쿠키 JWT) → 없으면 `getUser()`(검증·갱신).
 *
 * Kasama: production 이 아니고 `allowKasamaDevSession()` 일 때만 인정.
 * 로컬 기본 허용 / `NEXT_PUBLIC_DISABLE_KASAMA_SESSION=1` 로 끄면 `proxy`·`api-session` 과 맞춤.
 */
export async function getRouteUserId(): Promise<string | null> {
  if (!isProductionDeploy() && allowKasamaDevSession()) {
    const testUid = await readKasamaDevUserIdFromRequest();
    if (testUid) return testUid;
  }
  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) return null;

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user?.id) return session.user.id;

  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (!error && user?.id) return user.id;

  return null;
}
