"use client";

import { awaitClientSupabaseSessionReady } from "@/lib/auth/await-client-supabase-session-ready";
import { getCurrentUserIdForDb, getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { getSupabaseClient } from "@/lib/supabase/client";

const DEFAULT_AUTH_READY_WAIT_MS = 400;

/**
 * 인증 필요 API fetch 직전 — Supabase `INITIAL_SESSION` 짧은 대기 후 user id 확정.
 * `null` = 세션 없음·복구 실패 → 호출부는 네트워크 생략.
 */
export async function resolveClientAuthenticatedUserIdForFetch(
  maxWaitMs = DEFAULT_AUTH_READY_WAIT_MS
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const syncId = getSyncViewerUserIdForClient();
  if (syncId) return syncId;

  await awaitClientSupabaseSessionReady(maxWaitMs);

  const sb = getSupabaseClient();
  if (sb) {
    const { data } = await sb.auth.getSession();
    const sessionUserId = data.session?.user?.id?.trim();
    if (sessionUserId) return sessionUserId;
  }

  const dbUserId = await getCurrentUserIdForDb();
  return dbUserId?.trim() || null;
}
