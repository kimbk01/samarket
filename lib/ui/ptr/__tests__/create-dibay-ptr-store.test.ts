import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDibayKeyedPtrStore, createDibayPtrStore } from "@/lib/ui/ptr/create-dibay-ptr-store";
import {
  aggregateDibayPtrOutcomes,
  DIBAY_PTR_THRESHOLD_PX,
  deriveDibayPtrPullPhase,
  type DibayPtrPhase,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

/** 실제 타이머 대신 fake timer — window.setTimeout 을 전역 setTimeout 으로 연결 */
function stubWindowTimers() {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    setTimeout(() => fn(0), 0);
    return 0;
  });
}

function recordPhases(store: { subscribe: (l: () => void) => () => void; getSnapshot: () => { phase: DibayPtrPhase } }) {
  const phases: DibayPtrPhase[] = [];
  const unsub = store.subscribe(() => {
    const p = store.getSnapshot().phase;
    if (phases[phases.length - 1] !== p) phases.push(p);
  });
  return { phases, unsub };
}

const timings = { minSpinMs: 100, successHoldMs: 200, errorHoldMs: 300, handlerTimeoutMs: 1000 };

describe("createDibayPtrStore", () => {
  beforeEach(() => {
    stubWindowTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("success: REFRESHING → SUCCESS → IDLE and keeps MIN_SPIN", async () => {
    const preflight = vi.fn();
    const store = createDibayPtrStore({ preflight, timings });
    store.addHandler(async () => "success" as const);
    const { phases } = recordPhases(store);

    const p = store.run(70);
    expect(store.getSnapshot()).toMatchObject({ phase: "REFRESHING", refreshing: true, pullPx: 70 });
    await vi.advanceTimersByTimeAsync(99);
    expect(store.getSnapshot().phase).toBe("REFRESHING");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot()).toMatchObject({ phase: "SUCCESS", refreshing: false, pullPx: 70 });
    await vi.advanceTimersByTimeAsync(200);
    const r = await p;

    expect(r).toEqual({ status: "success", partial: false, timedOut: false });
    expect(store.getSnapshot()).toMatchObject({ phase: "IDLE", pullPx: 0, refreshing: false });
    expect(phases).toEqual(["REFRESHING", "SUCCESS", "IDLE"]);
    expect(preflight).toHaveBeenCalledTimes(1);
  });

  it("legacy void handler counts as success", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => {});
    const p = store.run(60);
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ status: "success" });
  });

  it("throwing handler → ERROR (no unhandled rejection)", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => {
      throw new Error("network");
    });
    const p = store.run(60);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getSnapshot()).toMatchObject({
      phase: "ERROR",
      outcome: { status: "error", partial: false, timedOut: false },
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toMatchObject({ status: "error" });
    expect(store.getSnapshot().phase).toBe("IDLE");
  });

  it("partial failure across handlers → ERROR with partial=true", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "success" as const);
    store.addHandler(async () => "error" as const);
    const p = store.run(60);
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ status: "error", partial: true, timedOut: false });
  });

  it("cancelled only → CANCELLED then IDLE without result text", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "cancelled" as const);
    const { phases } = recordPhases(store);
    const p = store.run(60);
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ status: "cancelled" });
    expect(phases).toEqual(["REFRESHING", "CANCELLED", "IDLE"]);
  });

  it("timeout → ERROR timedOut=true", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(() => new Promise(() => {}));
    const p = store.run(60);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getSnapshot()).toMatchObject({ phase: "ERROR", outcome: { timedOut: true } });
    await vi.runAllTimersAsync();
    expect(await p).toMatchObject({ status: "error", timedOut: true });
  });

  it("no handler → collapses open hint immediately (D3)", async () => {
    const preflight = vi.fn();
    const store = createDibayPtrStore({ preflight, timings });
    store.patch({ pullPx: 80 });
    expect(store.getSnapshot().phase).toBe("READY");
    expect(await store.run(80)).toBe("no_handler");
    expect(store.getSnapshot()).toMatchObject({ phase: "IDLE", pullPx: 0 });
    expect(preflight).not.toHaveBeenCalled();
  });

  it("re-entry while REFRESHING → busy, handler runs once", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    const h = vi.fn(async () => "success" as const);
    store.addHandler(h);
    const p1 = store.run(60);
    expect(await store.run(60)).toBe("busy");
    await vi.runAllTimersAsync();
    await p1;
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("new pull during SUCCESS display interrupts the stale run writes", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "success" as const);
    const p = store.run(60);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    store.patch({ pullPx: 20 });
    expect(store.getSnapshot()).toMatchObject({ phase: "PULLING", pullPx: 20 });
    await vi.runAllTimersAsync();
    await p;
    // run 의 SUCCESS hold 종료 쓰기가 사용자의 새 당김을 덮지 않음
    expect(store.getSnapshot()).toMatchObject({ phase: "PULLING", pullPx: 20 });
  });

  it("forced reset while REFRESHING (unmount) → IDLE and stale run does not reopen", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "success" as const);
    const p = store.run(60);
    store.patch({ refreshing: false, pullPx: 0 });
    expect(store.getSnapshot()).toMatchObject({ phase: "IDLE", pullPx: 0 });
    await vi.runAllTimersAsync();
    await p;
    expect(store.getSnapshot()).toMatchObject({ phase: "IDLE", pullPx: 0 });
  });
});

describe("createDibayKeyedPtrStore", () => {
  beforeEach(() => {
    stubWindowTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs only the matching key and unregister keeps a newer handler", async () => {
    const store = createDibayKeyedPtrStore({ preflight: () => {}, timings });
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    const unregA = store.addHandler("/market", a);
    store.addHandler("/market", b);
    unregA();
    const p = store.run(60, "/market");
    await vi.runAllTimersAsync();
    await p;
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(await store.run(60, "/market/other")).toBe("no_handler");
  });
});

describe("dibay-ptr-ssot", () => {
  it("derives pull phases from threshold", () => {
    expect(deriveDibayPtrPullPhase(0)).toBe("IDLE");
    expect(deriveDibayPtrPullPhase(DIBAY_PTR_THRESHOLD_PX - 1)).toBe("PULLING");
    expect(deriveDibayPtrPullPhase(DIBAY_PTR_THRESHOLD_PX)).toBe("READY");
  });

  it("aggregates outcomes", () => {
    expect(aggregateDibayPtrOutcomes([])).toMatchObject({ status: "cancelled" });
    expect(
      aggregateDibayPtrOutcomes([
        { status: "success", timedOut: false },
        { status: "cancelled", timedOut: false },
      ])
    ).toMatchObject({ status: "success", partial: false });
  });
});
