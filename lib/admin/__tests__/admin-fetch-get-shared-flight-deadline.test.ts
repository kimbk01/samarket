// @vitest-environment jsdom
/**
 * 관리자 GET 공유 요청 — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청.
 * 합류한 호출자마다 본문을 따로 읽을 수 있고, GET 외 요청에는 마감을 걸지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

const payload = { ok: true, stores: [{ id: "s1" }] };

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
  return import("@/lib/admin/admin-fetch-client");
}

describe("관리자 GET 공유 요청 마감", () => {
  it.each(["header_stall", "body_stall"] as const)("%s → 마감 안 종료 + 재진입 새 요청", async (kind) => {
    const m = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, () =>
      m.adminFetch("/api/admin/stores").then((r) => r.json())
    );
  });

  it("정상 — 동시 호출 1회 요청, 호출자마다 본문 읽기 가능", async () => {
    const m = await load();
    const [a, b] = await Promise.all([m.adminFetch("/api/admin/stores"), m.adminFetch("/api/admin/stores")]);
    expect(stallState.fetchCalls).toBe(1);
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(payload);
    expect(await b.json()).toEqual(payload);
  });

  it("정상 — GET TTL 캐시 유지", async () => {
    const m = await load();
    await (await m.adminFetch("/api/admin/stores", { cacheTtlMs: 5_000 })).json();
    expect(await (await m.adminFetch("/api/admin/stores", { cacheTtlMs: 5_000 })).json()).toEqual(payload);
    expect(stallState.fetchCalls).toBe(1);
  });

  it("POST 는 마감을 걸지 않는다(저장 중복 실행 방지)", async () => {
    const m = await load();
    stallState.behavior = "header_stall";
    let settled = false;
    void m.adminFetch("/api/admin/stores", { method: "POST" }).finally(() => (settled = true)).catch(() => {});
    await vi.advanceTimersByTimeAsync(12_050);
    expect(settled).toBe(false);
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls[0][1];
    expect(init?.signal).toBeUndefined();
  });
});
