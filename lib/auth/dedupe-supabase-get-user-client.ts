import type { SupabaseClient, UserResponse } from "@supabase/supabase-js";

let inflight: Promise<UserResponse> | null = null;

/** 브라우저에서 동시에 여러 `auth.getUser()` 가 나가지 않게 한다 (AppBoot·AuthSync). */
export function dedupeSupabaseAuthGetUser(sb: SupabaseClient): Promise<UserResponse> {
  if (inflight) return inflight;
  inflight = sb.auth.getUser().finally(() => {
    inflight = null;
  });
  return inflight;
}
