import type { Profile } from "@/lib/types/profile";
import type { Session, User } from "@supabase/supabase-js";

let cached: Profile | null = null;

export function setSupabaseProfileCache(profile: Profile | null): void {
  cached = profile;
}

export function getSupabaseProfileCache(): Profile | null {
  return cached;
}

/** profiles 저장 직후 세션 메타와 불일치할 때 헤더·폴백 조회용 캐시를 맞춤 */
export function patchSupabaseProfileCache(updates: Partial<Profile>): void {
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
