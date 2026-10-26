import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 결함 F (docs/audit/messenger-2026-10-26-d6-list-archive-root-cause.md) */
const keepAlive = vi.fn();
const refreshFromRpc = vi.fn(async () => null);

vi.mock("@/lib/push/keep-alive-after-response", () => ({ keepAliveAfterResponse: (p: Promise<unknown>) => keepAlive(p) }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/community-messenger/home-sync-snapshot", () => ({ refreshHomeSyncSnapshotFromRpc: refreshFromRpc }));

describe("결함 F: 보관 값 변경 → 목록 정합 스냅샷 갱신", () => {
  beforeEach(() => {
    keepAlive.mockClear();
    refreshFromRpc.mockClear();
  });

  it("스냅샷 갱신은 응답 뒤에도 끝까지 실행되도록 keepAliveAfterResponse 에 넘긴다", async () => {
    const { scheduleHomeSyncSnapshotRefresh } = await import("@/lib/community-messenger/home-sync-snapshot-refresh");
    scheduleHomeSyncSnapshotRefresh("user-f");
    expect(refreshFromRpc).toHaveBeenCalledTimes(1);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    await expect(keepAlive.mock.calls[0]![0]).resolves.toBeNull();
  });

  it("보관/해제 성공 뒤 스냅샷 3종을 무효화한다", () => {
    const src = readFileSync("lib/community-messenger/service.ts", "utf8");
    const start = src.indexOf(".update({ is_archived: input.archived })");
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, start + 900);
    expect(block).toContain("invalidateHomeSyncSnapshotCache(input.userId);");
    expect(block).toContain("invalidateCmBootstrapSnapshotCache(input.userId);");
    expect(block).toContain('invalidateFullBootstrapSnapshotCache(input.userId, "room_archive");');
  });
});
