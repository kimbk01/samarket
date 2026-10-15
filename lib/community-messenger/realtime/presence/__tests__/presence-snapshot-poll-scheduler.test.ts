import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { createPresenceSnapshotPollScheduler } from "@/lib/community-messenger/realtime/presence/presence-snapshot-poll-scheduler";

type Snap = CommunityMessengerPeerPresenceSnapshot;

function setup(opts?: { healthy?: boolean; visible?: boolean; maxIdsPerTick?: number }) {
  const state = { healthy: opts?.healthy ?? false, visible: opts?.visible ?? true, deferred: false };
  const calls: string[][] = [];
  const applied: string[][] = [];
  const fetchBatch = vi.fn(async (ids: string[]) => {
    calls.push([...ids]);
    return new Map<string, Snap>(ids.map((id) => [id, { userId: id, state: "online", lastSeenAt: null }]));
  });
  const scheduler = createPresenceSnapshotPollScheduler({
    fetchBatch,
    apply: (m) => applied.push([...m.keys()]),
    isRealtimeHealthy: () => state.healthy,
    isDeferred: () => state.deferred,
    isDocumentVisible: () => state.visible,
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    intervalMs: 12_000,
    coalesceMs: 50,
    minRunGapMs: 2_000,
    maxIdsPerTick: opts?.maxIdsPerTick,
  });
  return { scheduler, state, calls, applied, fetchBatch };
}

describe("createPresenceSnapshotPollScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces concurrent subscribers into a single batched fetch", async () => {
    const { scheduler, calls, applied } = setup();
    scheduler.subscribe("a");
    scheduler.subscribe("b");
    scheduler.subscribe("a");
    await vi.advanceTimersByTimeAsync(60);
    expect(calls).toEqual([["a", "b"]]);
    expect(applied).toEqual([["a", "b"]]);
  });

  it("re-polls on the interval while realtime is unhealthy", async () => {
    const { scheduler, calls } = setup();
    scheduler.subscribe("a");
    await vi.advanceTimersByTimeAsync(60);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(12_100);
    expect(calls).toHaveLength(3);
  });

  it("does not fetch while realtime is healthy and resumes when it becomes unhealthy", async () => {
    const { scheduler, state, calls } = setup({ healthy: true });
    scheduler.subscribe("a");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(0);
    state.healthy = false;
    await vi.advanceTimersByTimeAsync(12_100);
    expect(calls).toEqual([["a"]]);
  });

  it("stops the timer when the last subscriber leaves", async () => {
    const { scheduler, calls } = setup();
    const ua = scheduler.subscribe("a");
    const ub = scheduler.subscribe("b");
    await vi.advanceTimersByTimeAsync(60);
    ua();
    ub();
    expect(scheduler.isTimerActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it("pauses while hidden and refetches on visibility regain", async () => {
    const { scheduler, state, calls } = setup();
    scheduler.subscribe("a");
    await vi.advanceTimersByTimeAsync(60);
    state.visible = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
    state.visible = true;
    scheduler.notifyVisible();
    await vi.advanceTimersByTimeAsync(60);
    expect(calls).toHaveLength(2);
  });

  it("caps ids per run and enforces a minimum gap between runs", async () => {
    const { scheduler, calls } = setup({ maxIdsPerTick: 2 });
    for (const id of ["a", "b", "c", "d", "e"]) scheduler.subscribe(id);
    await vi.advanceTimersByTimeAsync(60);
    expect(calls).toEqual([["a", "b"]]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toEqual([["a", "b"], ["c", "d"]]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  it("a late subscriber only fetches its own id and keeps earlier ids on their cadence", async () => {
    const { scheduler, calls } = setup();
    scheduler.subscribe("a");
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(5_000);
    scheduler.subscribe("b");
    await vi.advanceTimersByTimeAsync(60);
    expect(calls).toEqual([["a"], ["b"]]);
    // "a" 는 첫 조회 후 12s 주기를 유지 (b 구독으로 밀리지 않음)
    await vi.advanceTimersByTimeAsync(7_000);
    expect(calls.length).toBe(3);
    expect(calls[2]).toEqual(["a"]);
  });
});
