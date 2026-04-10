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

const CURRENT_USER_ID_CACHE_TTL_MS = 15_000;

let currentUserIdCache:
  | {
      userId: string | null;
      expiresAt: number;
    }
  | null = null;
let currentUserIdPromise: Promise<string | null> | null = null;

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
  const cachedProfile = getSupabaseProfileCache();
  if (cachedProfile?.id) {
    currentUserIdCache = {
      userId: cachedProfile.id,
      expiresAt: Date.now() + CURRENT_USER_ID_CACHE_TTL_MS,
    };
    return cachedProfile.id;
  }

  const now = Date.now();
  if (currentUserIdCache && currentUserIdCache.expiresAt > now) {
    return currentUserIdCache.userId;
  }
  if (currentUserIdPromise) {
    return currentUserIdPromise;
  }

  currentUserIdPromise = (async () => {
    let resolvedUserId: string | null = null;
  if (!isProductionDeploy()) {
    const test = getTestAuth();
      if (test?.userId) {
        resolvedUserId = test.userId;
      }
  }
    if (!resolvedUserId) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (!error && user?.id) {
          resolvedUserId = user.id;
        }
      }
    }
    currentUserIdCache = {
      userId: resolvedUserId,
      expiresAt: Date.now() + CURRENT_USER_ID_CACHE_TTL_MS,
    };
    return resolvedUserId;
  })().finally(() => {
    currentUserIdPromise = null;
  });

  return currentUserIdPromise;
}

/**
 * 클라이언트에서만 — 프로필 캐시·테스트 세션 기준 사용자 ID.
 * `getCurrentUserIdForDb` 완료 전에도 채팅 화면에서 뷰어 식별용으로 사용해 체감 지연을 줄인다.
 */
export function getSyncViewerUserIdForClient(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (!isProductionDeploy()) {
    const test = getTestAuth();
    if (test?.userId?.trim()) return test.userId.trim();
  }
  const id = getCurrentUser()?.id?.trim();
  return id || undefined;
}

export const isAdminUser = checkAdminUser;
