/**
 * 공유 요청 멈춤 재현 하네스 — fetch 만 대체한다. stub 은 실제 fetch 처럼 signal abort 시에만 reject 한다.
 * 사용 테스트는 `// @vitest-environment jsdom` + `installStallFetch()` 를 beforeEach 에서 호출한다.
 */
import { expect, vi } from "vitest";

export type StallBehavior = "ok" | "header_stall" | "body_stall";

export const stallState = {
  behavior: "ok" as StallBehavior,
  fetchCalls: 0,
  body: { ok: true } as unknown,
};

function stall(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

function makeResponse(signal: AbortSignal | null | undefined): Response {
  const stalled = stallState.behavior === "body_stall";
  const body = stallState.body;
  const res = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => (stalled ? stall(signal) : Promise.resolve(body)),
    text: () => (stalled ? stall(signal) : Promise.resolve(JSON.stringify(body))),
    arrayBuffer: () =>
      stalled ? stall(signal) : Promise.resolve(new TextEncoder().encode(JSON.stringify(body)).buffer),
    clone: () => makeResponse(signal),
  };
  return res as unknown as Response;
}

export function installStallFetch(body: unknown = { ok: true }): void {
  sessionStorage.clear();
  localStorage.clear();
  stallState.behavior = "ok";
  stallState.fetchCalls = 0;
  stallState.body = body;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit = {}) => {
      stallState.fetchCalls += 1;
      if (stallState.behavior === "header_stall") return stall(init.signal);
      return Promise.resolve(makeResponse(init.signal));
    }),
  );
}

async function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  p.then(
    () => (settled = true),
    () => (settled = true),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return settled;
}

export const SHARED_FLIGHT_DEADLINE_TEST_MS = 12_000;

/** 멈춤 → 마감 안에 종료 → 재진입은 새 요청 1회 */
export async function expectStallSettlesAndRetryIsNewRequest(
  kind: Exclude<StallBehavior, "ok">,
  call: () => Promise<unknown>,
): Promise<void> {
  stallState.behavior = kind;
  expect(await settlesWithin(call(), SHARED_FLIGHT_DEADLINE_TEST_MS + 50)).toBe(true);
  stallState.behavior = "ok";
  const before = stallState.fetchCalls;
  expect(await settlesWithin(call(), 100)).toBe(true);
  expect(stallState.fetchCalls).toBe(before + 1);
}

/** 정상 응답 + 동시 호출은 네트워크 1회 */
export async function expectConcurrentCallsShareOneRequest(call: () => Promise<unknown>): Promise<unknown[]> {
  const results: unknown[] = [];
  const all = Promise.all([call(), call()]).then((r) => results.push(...r));
  expect(await settlesWithin(all, 100)).toBe(true);
  expect(stallState.fetchCalls).toBe(1);
  return results;
}
