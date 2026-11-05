// @vitest-environment jsdom
/**
 * 사장님 주문 건수(대시보드·주문 탭 뱃지) — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청.
 */
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  const m = await import("@/lib/business/fetch-store-order-counts-deduped");
  return { order_counts: () => m.fetchStoreOrderCountsDeduped("store-1", { force: true }) };
}

const names = ["order_counts"];

describe.each(["header_stall", "body_stall"] as const)("사장님 주문 건수(대시보드·주문 탭 뱃지) — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("사장님 주문 건수(대시보드·주문 탭 뱃지) — 정상 경로 보존", () => {
  it.each(names)("%s: 동시 호출 1회 요청", async (name) => {
    const calls = await load();
    await expectConcurrentCallsShareOneRequest(calls[name]);
  });
});
