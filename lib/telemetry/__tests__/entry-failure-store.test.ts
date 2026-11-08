/**
 * C8 — 실패만 DB 보존 (Pro 로그 보존 1일 대비). 개인정보 없음·중복 무시·30일 정리.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryTelemetryEvent } from "@/lib/telemetry/entry-telemetry-contract";

const upsert = vi.fn(async () => ({ error: null }));
const lt = vi.fn(async () => ({ error: null }));
const del = vi.fn(() => ({ lt }));
const from = vi.fn(() => ({ upsert, delete: del }));
let client: unknown = { from };
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => client }));

import {
  persistEntryFailureIfNeeded,
  resetEntryFailureStoreForTests,
  shouldPersistEntryEvent,
} from "@/lib/telemetry/entry-failure-store.server";

function ev(over: Partial<EntryTelemetryEvent> = {}): EntryTelemetryEvent {
  return {
    v: 1, run: "r1", seq: 1, kind: "cold", ev: "failure", platform: "android", appVersion: "1.2.5", appBuild: "37",
    webSha: "abc1234", entryKind: "user_cold", restoreHint: "fresh", releaseReason: null, failure: "chunk_reload",
    recovery: "none", prevFailure: null, reloads: 1, ageMs: 900, hiddenMs: null, visible: true, t: { firstHtml: 300 },
    ...over,
  };
}
const META = { deploymentId: "dpl_x", serverSha: "abc1234" };

beforeEach(() => {
  resetEntryFailureStoreForTests();
  client = { from };
  upsert.mockClear(); lt.mockClear(); del.mockClear(); from.mockClear();
});

describe("보존 대상", () => {
  it("실패·해제 없음·새로고침 회복만", () => {
    expect(shouldPersistEntryEvent(ev())).toBe(true);
    expect(shouldPersistEntryEvent(ev({ ev: "no_release", failure: null }))).toBe(true);
    expect(shouldPersistEntryEvent(ev({ ev: "released", failure: null, recovery: "after_reload" }))).toBe(true);
    expect(shouldPersistEntryEvent(ev({ ev: "released", failure: null }))).toBe(false);
    expect(shouldPersistEntryEvent(ev({ ev: "resume", failure: null }))).toBe(false);
    expect(shouldPersistEntryEvent(ev({ ev: "update_reload", failure: null }))).toBe(false);
  });
});

describe("저장", () => {
  it("계약 필드만 · (run,seq) 중복 무시", async () => {
    await persistEntryFailureIfNeeded(ev(), META, 1_000_000);
    expect(from).toHaveBeenCalledWith("app_entry_failures");
    const [row, opts] = upsert.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(opts).toEqual({ onConflict: "run,seq", ignoreDuplicates: true });
    expect(Object.keys(row).sort()).toEqual(
      [
        "age_ms", "app_build", "app_version", "deployment_id", "entry_kind", "ev", "failure", "hidden_ms", "kind",
        "platform", "prev_failure", "recovery", "release_reason", "reloads", "restore_hint", "run", "seq", "server_sha",
        "stages", "visible", "web_sha",
      ].sort()
    );
  });

  it("정상 해제는 DB 에 쓰지 않는다", async () => {
    await persistEntryFailureIfNeeded(ev({ ev: "released", failure: null }), META);
    expect(from).not.toHaveBeenCalled();
  });

  it("30일 정리는 인스턴스당 1시간에 1회", async () => {
    await persistEntryFailureIfNeeded(ev({ seq: 1 }), META, 10_000_000);
    await persistEntryFailureIfNeeded(ev({ seq: 2 }), META, 10_000_000 + 60_000);
    expect(lt).toHaveBeenCalledTimes(1);
    await persistEntryFailureIfNeeded(ev({ seq: 3 }), META, 10_000_000 + 3_600_000);
    expect(lt).toHaveBeenCalledTimes(2);
  });

  it("서비스 키 없음·DB 오류는 삼킨다", async () => {
    client = null;
    await expect(persistEntryFailureIfNeeded(ev(), META)).resolves.toBeUndefined();
    client = { from: () => { throw new Error("db down"); } };
    await expect(persistEntryFailureIfNeeded(ev(), META)).resolves.toBeUndefined();
  });
});

describe("마이그레이션 계약", () => {
  it("service_role 전용 · 개인정보 열 없음 · (run,seq) 고유", () => {
    const sql = readFileSync("supabase/migrations/20271108170000_app_entry_failures.sql", "utf8");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.app_entry_failures from anon, authenticated");
    expect(sql).toContain("unique (run, seq)");
    expect(sql).not.toMatch(/user_id|email|ip_address|user_agent|token/i);
  });
});
