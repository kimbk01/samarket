import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const awaitReady = vi.fn<(ms: number) => Promise<void>>();
vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: (ms: number) => awaitReady(ms),
}));
vi.mock("@/lib/auth/guest-auth-boot-markers", () => ({ logGuestAuthBootMarker: vi.fn() }));
vi.mock("@/lib/auth/guest-auth-state", () => ({
  isGuestAuthEstablished: () => false,
  isRecoverableGuestAuthEstablished: () => false,
  logGuestFetchSkipped: vi.fn(),
  noteGuest401: vi.fn(),
}));
vi.mock("@/lib/http/fetch-client-telemetry", () => ({
  isLikelyFetchAbortError: (e: unknown) => (e as { name?: string } | null)?.name === "AbortError",
  logFetchClientTelemetry: vi.fn(),
}));

import { clearAuthSessionClientCache, fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { getSingleFlightPromise } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, isSharedFlightDeadlineError } from "@/lib/http/shared-flight-deadline";

const FLIGHT = "client:GET:/api/auth/session";

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function track<T>(p: Promise<T>) {
  const s: { settled: boolean; error?: unknown; value?: T } = { settled: false };
  p.then(
    (value) => Object.assign(s, { settled: true, value }),
    (error) => Object.assign(s, { settled: true, error }),
  );
  return s;
}

describe("fetchAuthSessionNoStore deadline", () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    awaitReady.mockReset();
    awaitReady.mockResolvedValue(undefined);
    clearAuthSessionClientCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("normal 200 resolves with a readable body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200 }));
    const res = await fetchAuthSessionNoStore("test");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, authenticated: true });
  });

  it("stalled Supabase session wait ends at the deadline and releases the shared flight", async () => {
    awaitReady.mockReturnValue(new Promise(() => {}));
    const s = track(fetchAuthSessionNoStore("test"));
    await vi.advanceTimersByTimeAsync(ENTRY_SHARED_FLIGHT_DEADLINE_MS - 1);
    expect(s.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.settled).toBe(true);
    expect(isSharedFlightDeadlineError(s.error)).toBe(true);
    expect(getSingleFlightPromise(FLIGHT)).toBeUndefined();

    awaitReady.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await fetchAuthSessionNoStore("test");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("request stalled before headers is aborted at the deadline", async () => {
    let aborted = false;
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(abortError());
          });
        }),
    );
    const s = track(fetchAuthSessionNoStore("test"));
    await vi.advanceTimersByTimeAsync(ENTRY_SHARED_FLIGHT_DEADLINE_MS);
    expect(s.settled).toBe(true);
    expect(isSharedFlightDeadlineError(s.error)).toBe(true);
    expect(aborted).toBe(true);
  });

  it("body stalled after headers is covered by the same deadline", async () => {
    fetchMock.mockImplementation((_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(abortError()));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const s = track(fetchAuthSessionNoStore("test"));
    await vi.advanceTimersByTimeAsync(ENTRY_SHARED_FLIGHT_DEADLINE_MS);
    expect(s.settled).toBe(true);
    expect(isSharedFlightDeadlineError(s.error)).toBe(true);
  });

  it("concurrent callers join one request", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const [a, b] = await Promise.all([fetchAuthSessionNoStore("a"), fetchAuthSessionNoStore("b")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
