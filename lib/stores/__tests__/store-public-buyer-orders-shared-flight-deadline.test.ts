// @vitest-environment jsdom
/**
 * 배달 매장 공개 화면(요약·메뉴·리뷰·공개·상품·업종·둘러보기·ETA)·구매자 주문(목록·상세·이벤트·허브 요약) 공유 GET —
 * 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청.
 * 프리워밍·장바구니가 넘기는 호출자 signal 은 기존처럼 공유 fetch 를 함께 끊는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true });
  await import("@/lib/i18n/language-preference");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  const m = await import("@/lib/stores/store-delivery-api-client");
  return {
    summary: () => m.fetchStoreSummaryDeduped("s-1"),
    menus: () => m.fetchStoreMenusDeduped("s-1"),
    reviews_summary: () => m.fetchStoreReviewsSummaryDeduped("s-1"),
    public: () => m.fetchStorePublicBySlugDeduped("s-1"),
    product: () => m.fetchStoreProductPublicDeduped("p-1"),
    reviews: () => m.fetchStoreReviewsPublicDeduped("s-1"),
    taxonomy: () => m.fetchStoresTaxonomyDeduped({ language: "ko" }),
    browse: () => m.fetchStoresBrowseDeduped("primary=food", { language: "ko" }),
    eta: () => m.fetchStoreDeliveryEtaDeduped("s-1", "addr-1"),
    buyer_orders_list: () => m.fetchMeStoreOrdersListDeduped("?tab=active"),
    buyer_order_detail: () => m.fetchMeStoreOrderDetailDeduped("o-1", { force: true }),
    buyer_order_events: () => m.fetchMeStoreOrderEventsDeduped("o-1", { force: true }),
    hub_summary: () => m.fetchMeStoreOrdersHubSummaryDeduped({ force: true }),
  };
}

const names = [
  "summary",
  "menus",
  "reviews_summary",
  "public",
  "product",
  "reviews",
  "taxonomy",
  "browse",
  "eta",
  "buyer_orders_list",
  "buyer_order_detail",
  "buyer_order_events",
  "hub_summary",
];

describe.each(["header_stall", "body_stall"] as const)("매장 공개·구매자 주문 — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("매장 공개·구매자 주문 — 정상 경로 보존", () => {
  it.each(names)("%s: 동시 호출 1회 요청", async (name) => {
    const calls = await load();
    await expectConcurrentCallsShareOneRequest(calls[name]);
  });

  it("요약: 호출자 signal 취소는 기존처럼 공유 fetch 도 끊고 AbortError 로 끝난다", async () => {
    const m = await import("@/lib/stores/store-delivery-api-client");
    stallState.behavior = "header_stall";
    const ac = new AbortController();
    const p = m.fetchStoreSummaryDeduped("s-abort", { signal: ac.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    ac.abort();
    await vi.advanceTimersByTimeAsync(10);
    const err = (await p) as Error;
    expect(err.name).toBe("AbortError");
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect(init.signal?.aborted).toBe(true);
  });

  it("요약: 마감 초과는 캐시하지 않고 다음 호출이 네트워크로 간다", async () => {
    const m = await import("@/lib/stores/store-delivery-api-client");
    stallState.behavior = "body_stall";
    const p = m.fetchStoreSummaryDeduped("s-nocache").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await p).toBeInstanceOf(Error);
    stallState.behavior = "ok";
    const before = stallState.fetchCalls;
    await m.fetchStoreSummaryDeduped("s-nocache");
    expect(stallState.fetchCalls).toBe(before + 1);
    await m.fetchStoreSummaryDeduped("s-nocache");
    expect(stallState.fetchCalls).toBe(before + 1);
  });
});
