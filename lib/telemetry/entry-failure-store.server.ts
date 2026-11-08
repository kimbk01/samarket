import "server-only";

import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { EntryTelemetryEvent } from "@/lib/telemetry/entry-telemetry-contract";

/**
 * C8 — 실패·해제 없음·새로고침 회복 이벤트만 `public.app_entry_failures` 에 보존한다
 * (Vercel Pro 런타임 로그 보존 1일 → 멈춤 증거가 하루 뒤 사라짐). 정상 해제·복귀는 로그 1줄만.
 * 마이그레이션: supabase/migrations/20271108170000_app_entry_failures.sql
 *
 * - 쓰기 실패는 삼킨다(수집 API 는 항상 204).
 * - 같은 (run, seq) 는 한 번만 (unique · ignoreDuplicates).
 * - 30일 지난 행 삭제는 인스턴스당 1시간에 1회.
 */

export const ENTRY_FAILURE_RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 60 * 60_000;
let lastPruneAt = 0;

/** 보존 대상인지 — 실패·해제 없음·새로고침 후 회복 기록. */
export function shouldPersistEntryEvent(event: EntryTelemetryEvent): boolean {
  return event.ev === "failure" || event.ev === "no_release" || event.recovery === "after_reload";
}

export type EntryEventServerMeta = {
  deploymentId: string | null;
  serverSha: string | null;
};

export async function persistEntryFailureIfNeeded(
  event: EntryTelemetryEvent,
  meta: EntryEventServerMeta,
  nowMs: number = Date.now()
): Promise<void> {
  if (!shouldPersistEntryEvent(event)) return;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return;
  try {
    await sb.from("app_entry_failures").upsert(
      {
        run: event.run,
        seq: event.seq,
        kind: event.kind,
        ev: event.ev,
        platform: event.platform,
        app_version: event.appVersion,
        app_build: event.appBuild,
        web_sha: event.webSha,
        entry_kind: event.entryKind,
        restore_hint: event.restoreHint,
        release_reason: event.releaseReason,
        failure: event.failure,
        recovery: event.recovery,
        prev_failure: event.prevFailure,
        reloads: event.reloads,
        age_ms: event.ageMs,
        hidden_ms: event.hiddenMs,
        visible: event.visible,
        stages: event.t,
        deployment_id: meta.deploymentId,
        server_sha: meta.serverSha,
      },
      { onConflict: "run,seq", ignoreDuplicates: true }
    );
    if (nowMs - lastPruneAt >= PRUNE_INTERVAL_MS) {
      lastPruneAt = nowMs;
      const cutoff = new Date(nowMs - ENTRY_FAILURE_RETENTION_DAYS * 86_400_000).toISOString();
      await sb.from("app_entry_failures").delete().lt("created_at", cutoff);
    }
  } catch {
    /* 계측 보존 실패는 무시 */
  }
}

export function resetEntryFailureStoreForTests(): void {
  lastPruneAt = 0;
}
