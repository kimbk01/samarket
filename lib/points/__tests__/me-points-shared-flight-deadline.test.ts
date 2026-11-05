// @vitest-environment jsdom
/**
 * 내정보 포인트 공유 요청 — 헤더·본문 멈춤에도 마감 안에 reject(→ 포인트·소멸 예정 화면 기존 catch), 재진입은 새 요청.
 * 정상 응답은 동시 호출 1회 요청·첫 페이지 캐시 유지, 마감 초과는 캐시하지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

const payload = { ok: true, balance: 100, history: { items: [], hasMore: false } };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch(payload);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function load() {
  return import("@/lib/points/me-points-client");
}

describe("내정보 포인트 공유 요청 마감", () => {
  it.each(["header_stall", "body_stall"] as const)("%s → 마감 안 종료 + 재진입 새 요청", async (kind) => {
    const m = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, () => m.fetchMePoints({ filter: "all" }));
  });

  it("정상 — 동시 호출 1회 요청 + 첫 페이지 캐시", async () => {
    const m = await load();
    const results = await expectConcurrentCallsShareOneRequest(() => m.fetchMePoints({ filter: "all" }));
    expect(results[0]).toEqual({ status: 200, ok: true, json: payload });
    expect(m.peekMePointsCache("all")).toEqual(payload);
  });

  it("마감 초과는 캐시하지 않는다", async () => {
    const m = await load();
    stallState.behavior = "body_stall";
    const p = m.fetchMePoints({ filter: "all" }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await p).toBeInstanceOf(Error);
    expect(m.peekMePointsCache("all")).toBeNull();
  });
});
