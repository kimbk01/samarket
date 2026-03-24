import type { Profile } from "@/lib/types/profile";
import type { Session } from "@supabase/supabase-js";

let cached: Profile | null = null;

export function setSupabaseProfileCache(profile: Profile | null): void {
  cached = profile;
}

export function getSupabaseProfileCache(): Profile | null {
  return cached;
}

export function sessionToProfile(session: Session | null): Profile | null {
  const u = session?.user;
  if (!u?.id) return null;
  const meta = u.user_metadata as Record<string, unknown> | undefined;
  const nick =
    (typeof meta?.nickname === "string" && meta.nickname) ||
    (typeof meta?.full_name === "string" && meta.full_name) ||
    u.email?.split("@")[0] ||
    "User";
  return {
    id: u.id,
    email: u.email ?? "",
    nickname: nick,
    avatar_url: typeof meta?.avatar_url === "string" ? meta.avatar_url : null,
    temperature: 50,
  };
}
