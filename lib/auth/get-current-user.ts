/**
 * 현재 로그인 사용자
 * - 아이디 로그인(test_users): sessionStorage + HttpOnly 쿠키(/api/test-login) — API와 동일 userId
 * - Supabase: 브라우저 세션 + SupabaseAuthSync가 채우는 프로필 캐시
 * - 관리자: isAdminUser() → lib/auth/admin-policy
 */
import type { Profile } from "@/lib/types/profile";
import { getTestAuth } from "@/lib/auth/test-auth-store";
import { isAdminUser as checkAdminUser } from "@/lib/auth/admin-policy";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isProductionDeploy } from "@/lib/config/deploy-surface";

/** 테스트 세션 제외 — 서버 초기 HTML·하이드레이션 안전 값 */
function resolveCurrentUserWithoutTestSession(): Profile | null {
  return getSupabaseProfileCache();
}

/**
 * 하이드레이션 일치용 초기값.
 * sessionStorage 테스트 로그인은 클라에서만 존재하므로 첫 렌더에 넣으면 서버 HTML과 불일치함.
 */
export function getHydrationSafeCurrentUser(): Profile | null {
  return resolveCurrentUserWithoutTestSession();
}

/** 현재 사용자: 테스트 로그인 우선 → Supabase 프로필 캐시 (production 에서는 테스트 세션 무시) */
export function getCurrentUser(): Profile | null {
  if (!isProductionDeploy()) {
    const test = getTestAuth();
    if (test) {
      return {
        id: test.userId,
        email: `${test.username}@test.local`,
        nickname: test.username,
        avatar_url: null,
        temperature: 50,
      };
    }
  }
  return getSupabaseProfileCache();
}

/** DB·API 클라이언트용 UUID: 테스트 유저 우선 → Supabase 세션 */
export async function getCurrentUserIdForDb(): Promise<string | null> {
  if (!isProductionDeploy()) {
    const test = getTestAuth();
    if (test?.userId) return test.userId;
  }
  const supabase = getSupabaseClient();
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
  }
  return null;
}

export const isAdminUser = checkAdminUser;
