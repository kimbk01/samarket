import "server-only";

import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { AuthFailureTelemetryEvent } from "@/lib/telemetry/auth-failure-telemetry-contract";

/**
 * 로그인 실패·취소 → `public.auth_login_failures` (30일 보존).
 * 마이그레이션: supabase/migrations/20271116140000_auth_login_failures.sql
 *
 * - 쓰기 실패는 삼킨다(수집 API 는 항상 204).
 * - 같은 authFlowId 는 한 번만 (unique · ignoreDuplicates).
 * - 남용 제한 = 앱 진입 계측(C8, entry-failure-store.server.ts)과 같은 값: 인스턴스 분당 60행 · IP 당 시간당 20행.
 *   IP 는 메모리 키로만 쓰고 저장·로그하지 않는다.
 * - 30일 지난 행 삭제는 인스턴스당 1시간에 1회.
 */

export const AUTH_FAILURE_RETENTION_DAYS = 30;
export const AUTH_FAILURE_WRITES_PER_MINUTE = 60;
export const AUTH_FAILURE_WRITES_PER_CLIENT_HOUR = 20;
const PRUNE_INTERVAL_MS = 60 * 60_000;
const CLIENT_KEYS_MAX = 5_000;
let lastPruneAt = 0;
let minuteWindowStart = 0;
let minuteWrites = 0;
const clientWrites = new Map<string, { windowStart: number; count: number }>();

export function admitAuthFailureWrite(clientKey: string | null, nowMs: number): boolean {
  if (nowMs - minuteWindowStart >= 60_000) {
    minuteWindowStart = nowMs;
    minuteWrites = 0;
  }
  if (minuteWrites >= AUTH_FAILURE_WRITES_PER_MINUTE) return false;
  if (clientKey) {
    const cur = clientWrites.get(clientKey);
    if (!cur || nowMs - cur.windowStart >= 3_600_000) {
      if (clientWrites.size >= CLIENT_KEYS_MAX) clientWrites.clear();
      clientWrites.set(clientKey, { windowStart: nowMs, count: 1 });
    } else {
      if (cur.count >= AUTH_FAILURE_WRITES_PER_CLIENT_HOUR) return false;
      cur.count += 1;
    }
  }
  minuteWrites += 1;
  return true;
}

export function resetAuthFailureStoreForTests(): void {
  lastPruneAt = 0;
  minuteWindowStart = 0;
  minuteWrites = 0;
  clientWrites.clear();
}

export type AuthFailureServerMeta = {
  deploymentId: string | null;
  serverSha: string | null;
};

export async function persistAuthLoginFailure(
  event: AuthFailureTelemetryEvent,
  meta: AuthFailureServerMeta,
  nowMs: number = Date.now(),
  clientKey: string | null = null
): Promise<void> {
  if (!admitAuthFailureWrite(clientKey, nowMs)) return;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return;
  try {
    await sb.from("auth_login_failures").upsert(
      {
        auth_flow_id: event.authFlowId,
        result: event.result,
        provider: event.provider,
        platform: event.platform,
        flow_kind: event.flowKind,
        error_code: event.errorCode,
        reason: event.reason,
        last_stage: event.lastStage,
        elapsed_ms: event.elapsedMs,
        native_error_code: event.nativeErrorCode,
        app_version: event.appVersion,
        app_build: event.appBuild,
        web_sha: event.webSha,
        deployment_id: meta.deploymentId,
        server_sha: meta.serverSha,
      },
      { onConflict: "auth_flow_id", ignoreDuplicates: true }
    );
    if (nowMs - lastPruneAt >= PRUNE_INTERVAL_MS) {
      lastPruneAt = nowMs;
      const cutoff = new Date(nowMs - AUTH_FAILURE_RETENTION_DAYS * 86_400_000).toISOString();
      await sb.from("auth_login_failures").delete().lt("created_at", cutoff);
    }
  } catch {
    /* 기록 실패는 무시 */
  }
}
