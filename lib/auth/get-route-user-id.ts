import { readKasamaDevUserIdFromRequest } from "@/lib/auth/kasama-session-cookies";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

/**
 * Route Handler에서 현재 사용자 UUID.
 * 아이디 로그인(test_users) 쿠키 우선 → Supabase Auth 세션.
 * production 배포 구간에서는 테스트 쿠키 무시(Supabase Auth 단일화).
 */
export async function getRouteUserId(): Promise<string | null> {
  if (!isProductionDeploy()) {
    const testUid = await readKasamaDevUserIdFromRequest();
    if (testUid) return testUid;
  }
  const sb = await createSupabaseRouteHandlerClient();
  if (sb) {
    const {
      data: { user },
      error,
    } = await sb.auth.getUser();
    if (!error && user?.id) return user.id;
  }
  return null;
}
