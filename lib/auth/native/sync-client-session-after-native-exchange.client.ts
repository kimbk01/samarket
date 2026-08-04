"use client";

import { primeClientAuthSessionFromSupabase } from "@/lib/auth/auth-session-immediate.client";
import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";
import { clearAuthSessionClientCache } from "@/lib/auth/fetch-auth-session-client";
import { clearGuestAuthState } from "@/lib/auth/guest-auth-state";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  bumpAuthLifecycleCounter,
  markAuthLifecycleStage,
} from "@/lib/auth/oauth/auth-lifecycle-trace";
import { invalidateClientMembershipResolveFlight } from "@/lib/auth/resolve-client-profile-session";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Native exchange Set-Cookie → Supabase browser client 반영 대기 */
export const NATIVE_EXCHANGE_SESSION_READY_MS = 2_000;

/**
 * POST /api/auth/native/exchange 직후 — guest gate 해제·쿠키 세션 동기화·프로필 캐시 priming.
 * exchange 성공인데 마이페이지 게스트로 남는 레이스(401 → establishGuestAuthState) 방지.
 */
export async function syncClientSessionAfterNativeExchange(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  bumpAuthLifecycleCounter("clientSessionSync");

  clearGuestAuthState();
  clearAuthSessionClientCache();
  invalidateClientMembershipResolveFlight();

  const sb = getSupabaseClient();
  if (sb) {
    await awaitClientSupabaseSessionReady(NATIVE_EXCHANGE_SESSION_READY_MS);
    const { data: first } = await sb.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!first.session?.user?.id) {
      // P0-2: 직접 sb.auth.refreshSession() 금지 — canonical single-flight 경유.
      await runBrowserAuthRefreshDeduped(sb, "native_exchange_sync", {
        allowRecoverableGuest: true,
      }).catch(() => undefined);
    }
  }

  const primed = await primeClientAuthSessionFromSupabase();
  dispatchTestAuthChanged();
  logOAuthNativeEvent("native_exchange_session_synced", { primed });
  markAuthLifecycleStage("client_session_visible", { primed, via: "syncClientSessionAfterNativeExchange" });
  return primed;
}
