import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api-auth-recovery", () => ({ recoverFrom401Once: vi.fn() }));
vi.mock("@/lib/app-boot/client-boot-request-journal", () => ({ recordBootVerifyFetch: vi.fn() }));
vi.mock("@/lib/dibay/shell-fetch-trace", () => ({ logShellFetchTrace: vi.fn() }));

import { recoverFrom401Once } from "@/lib/auth/api-auth-recovery";
import { isGuestAuthEstablished } from "@/lib/auth/guest-auth-state";
import { getSingleFlightPromise } from "@/lib/http/run-single-flight";
import { isSharedFlightDeadlineError } from "@/lib/http/shared-flight-deadline";
import { resolveMypageHomeProfileResult } from "@/lib/mypage/resolve-mypage-home-profile";
import {
  fetchMeProfileFresh,
  fetchMeProfileFullBackground,
  invalidateMeProfileDedupedCache,
  ME_PROFILE_FETCH_TIMEOUT_MS,
  peekMeProfileCached,
} from "@/lib/profile/fetch-me-profile-deduped";

const FLIGHT_KEY = "me:profile:get:full";

type Settle = { settled: boolean; ok?: boolean; value?: unknown; error?: unknown };
function track<T>(p: Promise<T>): Settle {
  const s: Settle = { settled: false };
  p.then(
    (v) => Object.assign(s, { settled: true, ok: true, value: v }),
    (e) => Object.assign(s, { settled: true, ok: false, error: e }),
  );
  return s;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** 실제 fetch 처럼 signal abort 시 reject — 응답 헤더 전 멈춤 */
function stallBeforeHeaders(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(abortError()));
  });
}

/** 헤더는 오고 본문이 멈춤 — abort 시 본문 읽기가 reject */
function stallBody(_url: string, init?: RequestInit): Promise<Response> {
  const body = new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(abortError()));
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

function profileResponse(id: string): Response {
  return new Response(JSON.stringify({ ok: true, profile: { id } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** delayMs 뒤 응답 — 그 전에 abort 되면 reject (늦게 도착한 응답은 이미 끝난 Promise 에 영향 없음) */
function respondAfter(delayMs: number, make: () => Response) {
  return (_url: string, init?: RequestInit): Promise<Response> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(make()), delayMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(abortError());
      });
    });
}

describe("me profile fetch deadline (request + body)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateMeProfileDedupedCache();
    vi.mocked(recoverFrom401Once).mockReset();
  });
  afterEach(() => {
    invalidateMeProfileDedupedCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("A1 stall before headers: rejects at deadline, timer cleared, flight released, retry sends a new request", async () => {
    const fetchMock = vi.fn(stallBeforeHeaders);
    vi.stubGlobal("fetch", fetchMock);
    const first = track(fetchMeProfileFullBackground("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS - 1);
    expect(first.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(first).toMatchObject({ settled: true, ok: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(getSingleFlightPromise(FLIGHT_KEY)).toBeUndefined();
    expect(peekMeProfileCached()).toBeNull();

    fetchMock.mockImplementation(async () => profileResponse("u1"));
    const retry = await fetchMeProfileFullBackground("t");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retry.status).toBe(200);
    expect(peekMeProfileCached()?.status).toBe(200);
  });

  it("A2 stall in body after headers: rejects at deadline (not swallowed as {}), no cache write, flight released", async () => {
    const fetchMock = vi.fn(stallBody);
    vi.stubGlobal("fetch", fetchMock);
    const first = track(fetchMeProfileFullBackground("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS);
    expect(first).toMatchObject({ settled: true, ok: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(getSingleFlightPromise(FLIGHT_KEY)).toBeUndefined();
    expect(peekMeProfileCached()).toBeNull();
  });

  it("A3 normal response just before deadline: resolves with data, timer cleared, cached", async () => {
    vi.stubGlobal("fetch", vi.fn(respondAfter(ME_PROFILE_FETCH_TIMEOUT_MS - 50, () => profileResponse("u1"))));
    const p = track(fetchMeProfileFullBackground("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS - 50);
    expect(p).toMatchObject({ settled: true, ok: true });
    expect((p.value as { status: number }).status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
    expect(peekMeProfileCached()?.status).toBe(200);
    expect(getSingleFlightPromise(FLIGHT_KEY)).toBeUndefined();
  });

  it("A4 race at the deadline: settles exactly once as failure, no cache write", async () => {
    vi.stubGlobal("fetch", vi.fn(respondAfter(ME_PROFILE_FETCH_TIMEOUT_MS, () => profileResponse("late"))));
    const onResolve = vi.fn();
    const onReject = vi.fn();
    fetchMeProfileFullBackground("t").then(onResolve, onReject);
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS + 1_000);
    expect(onResolve).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(peekMeProfileCached()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("A4b headers arrive before deadline but body arrives after: deadline covers body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const body = new ReadableStream({
          start(controller) {
            const t = setTimeout(() => {
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ ok: true, profile: { id: "late" } })));
              controller.close();
            }, ME_PROFILE_FETCH_TIMEOUT_MS + 500);
            init?.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              controller.error(abortError());
            });
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );
    const p = track(fetchMeProfileFullBackground("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS);
    expect(p).toMatchObject({ settled: true, ok: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(peekMeProfileCached()).toBeNull();
  });

  it("A5 repeated retries while stalled join one request; after deadline the next retry is a new request", async () => {
    const fetchMock = vi.fn(stallBeforeHeaders);
    vi.stubGlobal("fetch", fetchMock);
    const calls = [track(fetchMeProfileFullBackground("a"))];
    await vi.advanceTimersByTimeAsync(1_000);
    calls.push(track(fetchMeProfileFullBackground("b")));
    await vi.advanceTimersByTimeAsync(1_000);
    calls.push(track(fetchMeProfileFullBackground("c")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS);
    for (const c of calls) expect(c).toMatchObject({ settled: true, ok: false });
    expect(getSingleFlightPromise(FLIGHT_KEY)).toBeUndefined();

    fetchMock.mockImplementation(async () => profileResponse("u1"));
    const next = await fetchMeProfileFullBackground("d");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next.status).toBe(200);
  });

  it("B late response of a timed-out request does not overwrite the new request's data or cache", async () => {
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
      .mockImplementationOnce(async () => profileResponse("new"));
    vi.stubGlobal("fetch", fetchMock);

    const first = track(fetchMeProfileFullBackground("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS);
    expect(first).toMatchObject({ settled: true, ok: false });

    const second = await fetchMeProfileFullBackground("t");
    expect((second.json as { profile: { id: string } }).profile.id).toBe("new");

    lateResolve!(profileResponse("old"));
    await vi.advanceTimersByTimeAsync(0);
    const cached = peekMeProfileCached();
    expect((cached?.json as { profile: { id: string } }).profile.id).toBe("new");
  });

  it("C timeout is a network failure only — no 401 recovery, no guest state, mypage resolver throws (error UX) instead of unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn(stallBeforeHeaders));
    const guestBefore = isGuestAuthEstablished();
    const r = track(resolveMypageHomeProfileResult());
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS);
    expect(r).toMatchObject({ settled: true, ok: false });
    expect(isSharedFlightDeadlineError(r.error)).toBe(true);
    expect(recoverFrom401Once).not.toHaveBeenCalled();
    expect(isGuestAuthEstablished()).toBe(guestBefore);
    expect(peekMeProfileCached()).toBeNull();
  });

  it("C2 non-timeout malformed 200 body keeps legacy behavior ({} json, no throw)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200 })));
    const res = await fetchMeProfileFullBackground("t");
    expect(res).toEqual({ status: 200, json: {} });
  });

  it("C3 401 → recovered → retry still works under the deadline wrapper", async () => {
    vi.mocked(recoverFrom401Once).mockResolvedValue({ recovered: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
      .mockResolvedValueOnce(profileResponse("u1"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchMeProfileFullBackground("t");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("C4 401 → session recovery stalls: shared flight ends at the deadline, released, late recovery writes no cache", async () => {
    let finishRecovery: ((v: { recovered: true }) => void) | null = null;
    vi.mocked(recoverFrom401Once).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRecovery = resolve;
        }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
      .mockImplementation(async () => profileResponse("late"));
    vi.stubGlobal("fetch", fetchMock);

    const p = track(fetchMeProfileFullBackground("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS - 1);
    expect(p.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(p).toMatchObject({ settled: true, ok: false });
    expect(isSharedFlightDeadlineError(p.error)).toBe(true);
    expect(getSingleFlightPromise(FLIGHT_KEY)).toBeUndefined();

    finishRecovery!({ recovered: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekMeProfileCached()).toBeNull();
  });

  it("fresh: stall resolves null at deadline (sheet leaves loading), no prime, timer cleared", async () => {
    vi.stubGlobal("fetch", vi.fn(stallBody));
    const r = track(fetchMeProfileFresh("t"));
    await vi.advanceTimersByTimeAsync(ME_PROFILE_FETCH_TIMEOUT_MS);
    expect(r).toMatchObject({ settled: true, ok: true, value: null });
    expect(peekMeProfileCached()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fresh: normal response still primes the deduped cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => profileResponse("u9")));
    const p = await fetchMeProfileFresh("t");
    expect(p?.id).toBe("u9");
    expect(peekMeProfileCached()?.status).toBe(200);
  });
});
