/**
 * 5-C BR-01 — 스냅샷 갱신은 요청한 (1차, 2차) 키 그대로, 무효화는 해당 1차의 모든 2차 단일 비행을 해제.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshCalls: Array<{ primary: string; sub: string }> = [];
let releaseRefresh: (() => void) | null = null;

vi.mock("@/lib/stores/stores-browse-snapshot", () => ({
  refreshStoresBrowseSnapshotFromRpc: (_sb: unknown, primary: string, sub: string) => {
    refreshCalls.push({ primary, sub });
    return new Promise((res) => {
      releaseRefresh = () => res({ ok: true, store_rows: [] });
    });
  },
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
const invalidateMemory = vi.fn();
vi.mock("@/lib/stores/stores-browse-response-cache", () => ({
  invalidateStoresBrowseMemoryCache: (p?: string) => invalidateMemory(p),
}));

import {
  refreshStoresBrowseSnapshotKey,
  scheduleStoresBrowseSnapshotRefresh,
  storesBrowseSnapshotRefreshInflightKeys,
} from "@/lib/stores/stores-browse-snapshot-refresh";
import { invalidateStoresBrowseSnapshot } from "@/lib/stores/stores-browse-snapshot-cache";
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";

describe("5-C BR-01 snapshot refresh key", () => {
  beforeEach(() => {
    refreshCalls.length = 0;
    releaseRefresh?.();
    releaseRefresh = null;
  });

  it("2차 갱신 예약은 (1차, 2차) 그대로 RPC — 「전체」로 바꾸지 않는다", async () => {
    scheduleStoresBrowseSnapshotRefresh("Mart", "Meat");
    expect(refreshCalls).toEqual([{ primary: "mart", sub: "meat" }]);
    expect(storesBrowseSnapshotRefreshInflightKeys()).toContain("mart:meat");
    releaseRefresh?.();
    await Promise.resolve();
  });

  it("sub 생략 → all, 같은 키 진행 중이면 합류(RPC 1회)", async () => {
    scheduleStoresBrowseSnapshotRefresh("mart");
    const joined = refreshStoresBrowseSnapshotKey(null, "mart", "all");
    expect(refreshCalls).toEqual([{ primary: "mart", sub: "all" }]);
    releaseRefresh?.();
    await expect(joined).resolves.toEqual({ ok: true, store_rows: [] });
    expect(storesBrowseSnapshotRefreshInflightKeys()).not.toContain("mart:all");
  });

  it("서로 다른 2차는 별도 갱신", () => {
    scheduleStoresBrowseSnapshotRefresh("mart", "meat");
    scheduleStoresBrowseSnapshotRefresh("mart", "seafood");
    expect(refreshCalls.map((c) => c.sub)).toEqual(["meat", "seafood"]);
  });
});

describe("5-C BR-01 invalidation scope", () => {
  it("1차 무효화 → 그 1차의 모든 2차(counter·rpc) 단일 비행 해제, 다른 1차는 유지", () => {
    const pending = () => new Promise<null>(() => {});
    const keys = [
      "sb1-stores-browse-snapshot:mart:all:counter",
      "sb1-stores-browse-snapshot:mart:meat:counter",
      "sb1-stores-browse-snapshot:mart:seafood:rpc",
      "sb1-stores-browse-snapshot:restaurant:korean:counter",
    ];
    for (const k of keys) void runSingleFlight(k, pending);
    refreshCalls.length = 0;

    invalidateStoresBrowseSnapshot("mart", "test");

    expect(getSingleFlightPromise(keys[0]!)).toBeUndefined();
    expect(getSingleFlightPromise(keys[1]!)).toBeUndefined();
    expect(getSingleFlightPromise(keys[2]!)).toBeUndefined();
    expect(getSingleFlightPromise(keys[3]!)).toBeDefined();
    expect(invalidateMemory).toHaveBeenCalledWith("mart");
    expect(refreshCalls).toEqual([{ primary: "mart", sub: "all" }]);
  });
});
