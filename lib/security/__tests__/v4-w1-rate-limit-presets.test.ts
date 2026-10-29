/**
 * v4 W1 API-08·13 — 새 레이트리밋 프리셋(기존 `enforceRateLimit` 방식) 상한·코드.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/rate-limit-redis", () => ({
  getOptionalRateLimitRedis: () => null,
  rateLimitIncrCount: async () => 0,
  rateLimitPttlMs: async () => 0,
  rateLimitRedisStorageKey: (k: string) => k,
}));

import {
  enforceDeliveryAdClickQuota,
  enforceStoreOrderCreateQuota,
  enforceStoreReviewCreateQuota,
} from "@/lib/security/rate-limit-presets";

async function hitUntilLimited(fn: () => Promise<{ ok: boolean; response?: Response }>, max: number) {
  for (let i = 0; i < max; i += 1) {
    const r = await fn();
    if (!r.ok) return { allowed: i, response: r.response! };
  }
  return { allowed: max, response: null };
}

describe("v4 W1 rate-limit presets", () => {
  it("주문 생성: 사용자당 분당 10회, 11번째 429 store_order_create_rate_limited", async () => {
    const r = await hitUntilLimited(() => enforceStoreOrderCreateQuota("u-order"), 20);
    expect(r.allowed).toBe(10);
    expect(r.response?.status).toBe(429);
    expect(((await r.response!.json()) as { code: string }).code).toBe("store_order_create_rate_limited");
    // 다른 사용자는 별도 버킷
    expect((await enforceStoreOrderCreateQuota("u-order-2")).ok).toBe(true);
  });

  it("리뷰 작성: 사용자당 시간당 20회", async () => {
    const r = await hitUntilLimited(() => enforceStoreReviewCreateQuota("u-review"), 30);
    expect(r.allowed).toBe(20);
    expect(((await r.response!.json()) as { code: string }).code).toBe("store_review_rate_limited");
  });

  it("광고 클릭: 주체(user/ip)당 분당 60회", async () => {
    const r = await hitUntilLimited(() => enforceDeliveryAdClickQuota("ip:1.2.3.4"), 80);
    expect(r.allowed).toBe(60);
    expect(((await r.response!.json()) as { code: string }).code).toBe("delivery_ad_click_rate_limited");
  });
});
