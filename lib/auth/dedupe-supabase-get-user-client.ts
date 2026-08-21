import type { SupabaseClient, UserResponse } from "@supabase/supabase-js";

let inflight: Promise<UserResponse> | null = null;

/**
 * Supabase `auth.getUser()` 가 Auth 서버에서 무기한 pending 되면 App Boot 가
 * `hydrating` 에 갇혀 `/stores` feedReady=0 영구 blank 가 된다 (CUT-A P0).
 * 단일 비행은 유지하되 wall-clock 상한을 둔다 — timeout 은 user=null 로 취급.
 */
export const DEDUPE_SUPABASE_GET_USER_MAX_MS = 4_000;

function emptyUserResponse(): UserResponse {
  return { data: { user: null }, error: null } as unknown as UserResponse;
}

/** 브라우저에서 동시에 여러 `auth.getUser()` 가 나가지 않게 한다 (AppBoot·AuthSync). */
export function dedupeSupabaseAuthGetUser(sb: SupabaseClient): Promise<UserResponse> {
  if (inflight) return inflight;
  const getUser = sb.auth.getUser();
  if (typeof window === "undefined") {
    inflight = getUser.finally(() => {
      inflight = null;
    });
    return inflight;
  }
  inflight = Promise.race([
    getUser,
    new Promise<UserResponse>((resolve) => {
      window.setTimeout(() => resolve(emptyUserResponse()), DEDUPE_SUPABASE_GET_USER_MAX_MS);
    }),
  ]).finally(() => {
    inflight = null;
  });
  return inflight;
}
