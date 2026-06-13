import type { Profile } from "@/lib/types/profile";
import type { Session, User } from "@supabase/supabase-js";
import { extractOAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";

let cached: Profile | null = null;

/** `client-session-wipe` POST_LOGOUT_BFCACHE_GUARD_KEY 와 동일 — 순환 import 방지 */
const POST_LOGOUT_PROFILE_GUARD_KEY = "samarket:post_logout_guard";

export function isPostLogoutProfileRehydrateBlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(POST_LOGOUT_PROFILE_GUARD_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 브라우저 탭 전용 — Node(SSR·Route Handler·동시 요청)에서는 모듈 전역이
 * 요청 간에 공유되어 다른 클라이언트 세션이 섞일 수 있으므로 서버에서는 비활성.
 */
export function setSupabaseProfileCache(profile: Profile | null): void {
  if (typeof window === "undefined") return;
  if (profile !== null && isPostLogoutProfileRehydrateBlocked()) return;
  cached = profile;
}

export function getSupabaseProfileCache(): Profile | null {
  if (typeof window === "undefined") return null;
  return cached;
}

/** profiles 저장 직후 세션 메타와 불일치할 때 헤더·폴백 조회용 캐시를 맞춤 */
export function patchSupabaseProfileCache(updates: Partial<Profile>): void {
  if (typeof window === "undefined") return;
  if (!cached) return;
  cached = { ...cached, ...updates };
}

/** getUser() 등 세션 없이 User 만 있을 때 — getSession() 경고 회피·동일 메타 규칙 */
export function userToProfile(user: User | null | undefined): Profile | null {
  if (!user?.id) return null;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const nick =
    (typeof meta?.nickname === "string" && meta.nickname) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    "User";
  const authProv =
    typeof meta?.provider === "string" && meta.provider.trim()
      ? meta.provider.trim()
      : typeof meta?.auth_provider === "string" && meta.auth_provider.trim()
        ? meta.auth_provider.trim()
      : null;
  const oauthAvatar = extractOAuthProfileSeed(user).avatarCandidate;
  return {
    id: user.id,
    email: user.email ?? "",
    display_name: nick,
    nickname: nick,
    avatar_url: withDefaultAvatar(oauthAvatar),
    temperature: 50,
    provider: authProv,
    auth_provider: authProv,
  };
}

export function sessionToProfile(session: Session | null): Profile | null {
  return userToProfile(session?.user);
}
