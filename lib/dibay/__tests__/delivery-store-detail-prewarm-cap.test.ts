/**
 * v4 W3 PERF-04 — 카드 prewarm(menus·summary·banners) ambient 동시 상한 + 시작 기록 TTL 만료.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";

type Pending = { kind: string; slug: string; resolve: () => void };
const pending: Pending[] = [];
const calls: { kind: string; slug: string }[] = [];

function track(kind: string) {
  return (slug: string) => {
    calls.push({ kind, slug });
    return new Promise((resolve) => {
      pending.push({ kind, slug, resolve: () => resolve({ status: 200, json: {} }) });
    });
  };
}

vi.mock("@/lib/stores/store-delivery-api-client", () => ({
  fetchStoreMenusDeduped: (slug: string) => track("menus")(slug),
  fetchStoreSummaryDeduped: (slug: string) => track("summary")(slug),
  fetchStoreBannersDeduped: (slug: string) => track("banners")(slug),
}));

import {
  DELIVERY_STORE_AMBIENT_PREWARM_MAX_CONCURRENT,
  deliveryStoreDetailPrewarmAll,
  readDeliveryStoreAmbientPrewarmStateForTests,
  resetDeliveryStoreDetailPrewarmForTests,
} from "@/lib/dibay/delivery-store-detail-prewarm";
import { resetDeliveryStoreMenusPrewarmForTests } from "@/lib/dibay/delivery-store-menus-prewarm";
import { resetDeliveryStoreDetailPrewarmLifecycleForTests } from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";
import { STORE_SUMMARY_PUBLIC_CACHE_TTL_MS } from "@/lib/stores/store-delivery-client-cache-ttl";

async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

describe("PERF-04 ambient prewarm 동시 상한", () => {
  beforeEach(() => {
    pending.length = 0;
    calls.length = 0;
    resetDeliveryStoreDetailPrewarmForTests();
    resetDeliveryStoreMenusPrewarmForTests();
    resetDeliveryStoreDetailPrewarmLifecycleForTests();
    stubVitestMinimalWindow({ location: { pathname: "/stores" } as Location });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetDeliveryStoreDetailPrewarmForTests();
  });

  it("카드 5장이 동시에 보여도 매장 2곳(요청 6건)만 먼저 나간다", async () => {
    for (const s of ["a", "b", "c", "d", "e"]) deliveryStoreDetailPrewarmAll(s);
    expect(DELIVERY_STORE_AMBIENT_PREWARM_MAX_CONCURRENT).toBe(2);
    expect(calls.length).toBe(6);
    expect(new Set(calls.map((c) => c.slug))).toEqual(new Set(["a", "b"]));
    expect(readDeliveryStoreAmbientPrewarmStateForTests().queued).toEqual(["c", "d", "e"]);

    for (const p of pending.filter((x) => x.slug === "a")) p.resolve();
    await flush();
    expect(new Set(calls.map((c) => c.slug))).toEqual(new Set(["a", "b", "c"]));
    expect(calls.length).toBe(9);
  });

  it("force(탭 intent)는 상한을 거치지 않는다", () => {
    for (const s of ["a", "b"]) deliveryStoreDetailPrewarmAll(s);
    deliveryStoreDetailPrewarmAll("z", { force: true });
    expect(calls.filter((c) => c.slug === "z").length).toBe(3);
  });

  it("같은 매장 중복 예약은 1번만, 시작 기록은 캐시 TTL 뒤 만료", async () => {
    vi.useFakeTimers();
    deliveryStoreDetailPrewarmAll("a");
    deliveryStoreDetailPrewarmAll("a");
    expect(calls.length).toBe(3);
    for (const p of pending) p.resolve();
    await flush();
    deliveryStoreDetailPrewarmAll("a");
    expect(calls.length).toBe(3);
    vi.setSystemTime(Date.now() + STORE_SUMMARY_PUBLIC_CACHE_TTL_MS + 1);
    deliveryStoreDetailPrewarmAll("a");
    expect(calls.length).toBe(6);
  });
});
