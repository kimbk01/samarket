"use client";

import { setAppBootAnonymous, setAppBootLoading } from "@/lib/app-boot/app-boot-store";
import { bindAuthUserId } from "@/lib/auth/client-instance-id";
import { clearAuthSessionClientCache } from "@/lib/auth/fetch-auth-session-client";
import { invalidateClientMembershipResolveFlight } from "@/lib/auth/resolve-client-profile-session";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";
import {
  sessionToProfile,
  setSupabaseProfileCache,
} from "@/lib/auth/supabase-profile-cache";
import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";
import { clearGuestAuthState } from "@/lib/auth/guest-auth-state";
import { getSupabaseClient } from "@/lib/supabase/client";

const PRIME_SESSION_READY_MS = 1_500;

/**
 * Supabase 세션 쿠키가 이미 있을 때 — 프로필 캐시·헤더를 즉시 로그인 상태로 맞춘다.
 * full `ensureAppBoot` 전에 UI가 guest 로 남지 않게 한다.
 */
export async function primeClientAuthSessionFromSupabase(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  clearGuestAuthState();
  const sb = getSupabaseClient();
  if (!sb) return false;

  await awaitClientSupabaseSessionReady(PRIME_SESSION_READY_MS);

  let {
    data: { session },
  } = await sb.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!session?.user?.id) {
    await sb.auth.refreshSession().catch(() => undefined);
    ({
      data: { session },
    } = await sb.auth.getSession().catch(() => ({ data: { session: null } })));
  }
  const profile = sessionToProfile(session);
  if (!profile?.id) return false;

  bindAuthUserId(profile.id);
  setSupabaseProfileCache(profile);
  setAppBootLoading();
  dispatchTestAuthChanged();
  return true;
}

/** 로그아웃 직후 UI·캐시를 guest 로 즉시 전환 (heavy wipe/signOut 은 백그라운드) */
export function applyImmediateLogoutClientState(): void {
  if (typeof window === "undefined") return;
  setSupabaseProfileCache(null);
  clearAuthSessionClientCache();
  invalidateClientMembershipResolveFlight();
  setAppBootAnonymous();
  dispatchTestAuthChanged();
}
