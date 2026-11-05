// @vitest-environment jsdom
/**
 * 배달 사장님 주문 목록·이전 주문·날짜 필터·상세·매장 목록 공유 요청 — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청.
 * 목록·매장은 reject → OwnerStoreOrdersView 기존 catch(error 상태·loadInFlight 해제), 상세는 기존 network_error 결과.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true, orders: [], stores: [], order: { id: "order-1" } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  const list = await import("@/lib/stores/fetch-store-orders-list-deduped");
  const detail = await import("@/lib/business/fetch-owner-store-order-detail");
  const stores = await import("@/lib/me/fetch-me-stores-deduped");
  const dateFilter = { from: "2026-11-01", to: "2026-11-05", basis: "created" as const };
  return {
    orders_list: () => list.fetchStoreOrdersListDeduped("store-1", { forceNetwork: true }),
    orders_history: () => list.fetchOwnerStoreOrdersHistoryPage("store-1", "c1"),
    orders_date: () => list.fetchOwnerStoreOrdersDatePage("store-1", dateFilter, ""),
    order_detail: () => detail.fetchOwnerStoreOrderDetailDeduped("store-1", "order-1"),
    me_stores: () => {
      stores.invalidateMeStoresListDedupedCache();
      return stores.fetchMeStoresListDeduped();
    },
  };
}

const names = ["orders_list", "orders_history", "orders_date", "order_detail", "me_stores"];

describe.each(["header_stall", "body_stall"] as const)("사장님 주문 — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("사장님 주문 — 정상 경로 보존", () => {
  it.each(names.filter((n) => n !== "me_stores"))("%s: 동시 호출 1회 요청", async (name) => {
    const calls = await load();
    await expectConcurrentCallsShareOneRequest(calls[name]);
  });

  it("매장 목록: 동시 호출 1회 요청 + TTL 캐시 유지", async () => {
    const stores = await import("@/lib/me/fetch-me-stores-deduped");
    stores.invalidateMeStoresListDedupedCache();
    const results = await expectConcurrentCallsShareOneRequest(() => stores.fetchMeStoresListDeduped());
    expect(results[0]).toEqual({ status: 200, json: { ok: true, orders: [], stores: [], order: { id: "order-1" } } });
    await stores.fetchMeStoresListDeduped();
    expect(stallState.fetchCalls).toBe(1);
  });

  it("상세 마감 초과 → 기존 network_error 결과", async () => {
    const detail = await import("@/lib/business/fetch-owner-store-order-detail");
    stallState.behavior = "body_stall";
    const p = detail.fetchOwnerStoreOrderDetailDeduped("store-1", "order-1");
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await p).toMatchObject({ ok: false, status: 0, error: "network_error" });
  });

  it("매장 목록 마감 초과는 캐시하지 않는다", async () => {
    const stores = await import("@/lib/me/fetch-me-stores-deduped");
    stores.invalidateMeStoresListDedupedCache();
    stallState.behavior = "header_stall";
    const p = stores.fetchMeStoresListDeduped().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await p).toBeInstanceOf(Error);
    expect(stores.peekMeStoresListClientCache()).toBeNull();
  });
});
