import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: "u1" }) }));

import {
  fetchAddressDefaultsSnapshot,
  invalidateAddressDefaultsSnapshotCache,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import { resolveRequiredAddressFromSnapshot } from "@/lib/mypage/required-address-from-snapshot";

const DEADLINE_MS = 8_000;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

type Settle = { settled: boolean; value?: unknown };
function track<T>(p: Promise<T>): Settle {
  const s: Settle = { settled: false };
  void p.then((v) => Object.assign(s, { settled: true, value: v }));
  return s;
}

function stallBeforeHeaders(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(abortError())));
}

function stallBody(_url: string, init?: RequestInit): Promise<Response> {
  const body = new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(abortError()));
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

function defaultsResponse(label: string): Response {
  return new Response(
    JSON.stringify({ ok: true, defaults: { master: { id: label }, activeCount: 1 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const opts = { caller: "mypage_home_model", reason: "initial_required_info_resolution" } as const;

describe("address defaults deadline covers body read", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateAddressDefaultsSnapshotCache();
  });
  afterEach(() => {
    invalidateAddressDefaultsSnapshotCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stall before headers: null at 8s (unchanged), timer cleared", async () => {
    vi.stubGlobal("fetch", vi.fn(stallBeforeHeaders));
    const r = track(fetchAddressDefaultsSnapshot(opts));
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(r).toEqual({ settled: true, value: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stall in body: null at 8s (was: pending forever), no cache write, retry sends a new request", async () => {
    const fetchMock = vi.fn(stallBody);
    vi.stubGlobal("fetch", fetchMock);
    const a = track(fetchAddressDefaultsSnapshot(opts));
    await vi.advanceTimersByTimeAsync(1_000);
    const joined = track(fetchAddressDefaultsSnapshot({ ...opts, force: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(a).toEqual({ settled: true, value: null });
    expect(joined).toEqual({ settled: true, value: null });
    expect(peekFreshAddressDefaultsSnapshot()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    fetchMock.mockImplementation(async () => defaultsResponse("m1"));
    const next = await fetchAddressDefaultsSnapshot(opts);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next?.ok).toBe(true);
    expect(peekFreshAddressDefaultsSnapshot()?.defaults?.master).toEqual({ id: "m1" });
  });

  it("response just before the deadline succeeds and caches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const t = setTimeout(() => resolve(defaultsResponse("m2")), DEADLINE_MS - 50);
            init?.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(abortError());
            });
          }),
      ),
    );
    const r = track(fetchAddressDefaultsSnapshot(opts));
    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 50);
    expect(r.settled).toBe(true);
    expect((r.value as { ok: boolean }).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("late response of a timed-out request does not overwrite the newer cached snapshot", async () => {
    let lateResolve: ((r: Response) => void) | null = null;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            lateResolve = resolve;
            init?.signal?.addEventListener("abort", () => reject(abortError()));
          }),
      )
      .mockImplementationOnce(async () => defaultsResponse("new"));
    vi.stubGlobal("fetch", fetchMock);
    const first = track(fetchAddressDefaultsSnapshot(opts));
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    expect(first).toEqual({ settled: true, value: null });
    await fetchAddressDefaultsSnapshot(opts);
    lateResolve!(defaultsResponse("old"));
    await vi.advanceTimersByTimeAsync(0);
    expect(peekFreshAddressDefaultsSnapshot()?.defaults?.master).toEqual({ id: "new" });
  });

  it("timed-out snapshot (null) maps to address status unknown → mypage error row, not complete/required", () => {
    expect(resolveRequiredAddressFromSnapshot(null).status).toBe("unknown");
  });
});
