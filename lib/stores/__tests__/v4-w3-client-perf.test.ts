/**
 * v4 W3 — 배달 고객 클라 병목 계약.
 * - PERF-08 쿠폰 best-eligible 300ms debounce + abort
 * - PERF-14 업종 상단 배너 single-flight + 짧은 TTL
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORE_CART_COUPON_QUOTES_DEBOUNCE_MS,
  scheduleStoreCartBestEligibleFetch,
} from "@/lib/stores/store-cart-coupon-quotes-client";
import {
  buildStoresBrowseTopBannersPath,
  clearStoresBrowseTopBannersClientCache,
  fetchStoresBrowseTopBannersDeduped,
  peekStoresBrowseTopBannersClientCache,
} from "@/lib/stores/stores-browse-top-banners-client";

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("PERF-08 — 쿠폰 best-eligible debounce·abort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("연속 금액 변경 → 마지막 값 1회만 요청, 이전 예약은 요청 없이 취소", async () => {
    const fetchImpl = vi.fn(async () => okJson({ ok: true, quotes: [] }));
    const onResult = vi.fn();
    let cancel = scheduleStoreCartBestEligibleFetch({
      storeId: "s1",
      itemGrossPhp: 100,
      delayMs: STORE_CART_COUPON_QUOTES_DEBOUNCE_MS,
      onResult,
      onError: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    vi.advanceTimersByTime(100);
    cancel();
    cancel = scheduleStoreCartBestEligibleFetch({
      storeId: "s1",
      itemGrossPhp: 200,
      delayMs: STORE_CART_COUPON_QUOTES_DEBOUNCE_MS,
      onResult,
      onError: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    vi.advanceTimersByTime(STORE_CART_COUPON_QUOTES_DEBOUNCE_MS - 1);
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain("itemGrossPhp=200");
    await vi.runAllTimersAsync();
    expect(onResult).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("진행 중 요청은 취소 시 abort, 늦은 응답은 적용하지 않음", async () => {
    let seenSignal: AbortSignal | undefined;
    let resolveFetch: ((r: Response) => void) | null = null;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      seenSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const onResult = vi.fn();
    const cancel = scheduleStoreCartBestEligibleFetch({
      storeId: "s1",
      itemGrossPhp: 100,
      delayMs: 0,
      onResult,
      onError: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    cancel();
    expect(seenSignal?.aborted).toBe(true);
    resolveFetch!(okJson({ ok: true, quotes: [] }));
    await vi.runAllTimersAsync();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("장바구니가 debounce 헬퍼를 쓴다 (직접 fetch 금지)", async () => {
    const { readFileSync } = await import("node:fs");
    const cart = readFileSync("components/stores/StoreCommerceCartPageClient.tsx", "utf8");
    expect(cart).toContain("scheduleStoreCartBestEligibleFetch({");
    expect(cart).not.toContain("void fetch(\n      `/api/me/store-coupons/best-eligible");
    expect(cart).toContain("return cancelFetch;");
  });
});

describe("PERF-14 — 업종 상단 배너 single-flight·TTL", () => {
  const path = buildStoresBrowseTopBannersPath("restaurant", "chicken");
  beforeEach(() => {
    clearStoresBrowseTopBannersClientCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearStoresBrowseTopBannersClientCache();
  });

  it("동시 호출 1건 + 이후 TTL 캐시 히트", async () => {
    const fetchMock = vi.fn(async () => okJson({ ok: true, physicalEnabled: true, banners: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([
      fetchStoresBrowseTopBannersDeduped(path),
      fetchStoresBrowseTopBannersDeduped(path),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(peekStoresBrowseTopBannersClientCache(path)).not.toBeNull();
    await fetchStoresBrowseTopBannersDeduped(path);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchStoresBrowseTopBannersDeduped(path, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("실패 응답은 캐시하지 않음", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ ok: false }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    await fetchStoresBrowseTopBannersDeduped(path);
    expect(peekStoresBrowseTopBannersClientCache(path)).toBeNull();
  });

  it("열람 게이트 차단 응답은 캐시하지 않음", async () => {
    const fetchMock = vi.fn(async () =>
      okJson({ ok: true, banners: [], physicalEnabled: false, meta: { viewer_gate: "login_required" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchStoresBrowseTopBannersDeduped(path);
    expect(peekStoresBrowseTopBannersClientCache(path)).toBeNull();
  });

  it("경로에 primary·sub 포함, 데이터 리셋이 캐시를 비운다", async () => {
    expect(path).toBe("/api/stores/browse-top-banners?primary=restaurant&sub=chicken");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/stores/store-home-feed-client-cache.ts", "utf8")).toContain(
      "clearStoresBrowseTopBannersClientCache();"
    );
  });
});
