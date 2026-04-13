import type { Profile } from "@/lib/types/profile";
import type { Session, User } from "@supabase/supabase-js";

let cached: Profile | null = null;

/**
 * 브라우저 탭 전용 — Node(SSR·Route Handler·동시 요청)에서는 모듈 전역이
 * 요청 간에 공유되어 다른 클라이언트 세션이 섞일 수 있으므로 서버에서는 비활성.
 */
export function setSupabaseProfileCache(profile: Profile | null): void {
  if (typeof window === "undefined") return;
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
    user.email?.split("@")[0] ||
    "User";
  const metaPic = typeof meta?.picture === "string" ? meta.picture : null;
  const metaAvatar = typeof meta?.avatar_url === "string" ? meta.avatar_url : null;
  const authProv =
    typeof meta?.auth_provider === "string" && meta.auth_provider.trim()
      ? meta.auth_provider.trim()
      : null;
  return {
    id: user.id,
    email: user.email ?? "",
    nickname: nick,
    avatar_url: metaAvatar || metaPic || null,
    temperature: 50,
    auth_provider: authProv,
  };
}

export function sessionToProfile(session: Session | null): Profile | null {
  return userToProfile(session?.user);
}
