/**
 * v4 W1 API-08 — 광고 클릭: 서버 파생 eventId(노출 ADS-10 과 같은 규칙)·서버 시각·IP/세션 quota.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordClick = vi.fn();
let viewer: string | null = null;

vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => viewer,
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/advertising/delivery-ad-event-writer", () => ({
  recordDeliveryAdClickFromToken: (...a: unknown[]) => recordClick(...a),
}));
vi.mock("@/lib/http/rate-limit-redis", () => ({
  getOptionalRateLimitRedis: () => null,
  rateLimitIncrCount: async () => 0,
  rateLimitPttlMs: async () => 0,
  rateLimitRedisStorageKey: (k: string) => k,
}));

import { POST } from "@/app/api/stores/ads/click/route";
import {
  deriveDeliveryAdClickEventId,
  deriveDeliveryAdImpressionEventId,
  hashDeliveryAdViewerSession,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";

let ipSeq = 0;
function click(body: Record<string, unknown>, ip: string) {
  return POST(
    new Request("http://localhost/api/stores/ads/click", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  recordClick.mockReset();
  recordClick.mockResolvedValue({ ok: true, id: "row-1", deduped: false });
  viewer = null;
  ipSeq += 1;
});

describe("API-08 광고 클릭 서버 파생 키", () => {
  it("클라이언트 eventId·occurredAt 무시 — 같은 토큰+세션은 같은 서버 eventId, 시각은 서버 시각", async () => {
    const ip = `10.0.0.${ipSeq}`;
    const before = Date.now();
    await click({ exposureToken: "tok-1", sessionSeed: "s-1", eventId: "client-a", occurredAt: "2000-01-01T00:00:00Z" }, ip);
    await click({ exposureToken: "tok-1", sessionSeed: "s-1", eventId: "client-b", occurredAt: "2099-01-01T00:00:00Z" }, ip);
    const [a, b] = recordClick.mock.calls.map((c) => c[1] as { eventId: string; occurredAtIso: string });
    const expected = deriveDeliveryAdClickEventId("tok-1", hashDeliveryAdViewerSession("s-1"));
    expect(a.eventId).toBe(expected);
    expect(b.eventId).toBe(expected);
    expect(a.eventId).not.toBe("client-a");
    for (const x of [a, b]) {
      const t = Date.parse(x.occurredAtIso);
      expect(t).toBeGreaterThanOrEqual(before - 1000);
      expect(t).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it("클릭 키는 노출 키와 다르고, 세션이 다르면 다른 키", () => {
    const h = hashDeliveryAdViewerSession("s-1");
    expect(deriveDeliveryAdClickEventId("tok", h)).not.toBe(deriveDeliveryAdImpressionEventId("tok", h));
    expect(deriveDeliveryAdClickEventId("tok", h)).not.toBe(
      deriveDeliveryAdClickEventId("tok", hashDeliveryAdViewerSession("s-2"))
    );
  });

  it("impressionEventId 는 uuid 형식만 전달", async () => {
    const ip = `10.0.1.${ipSeq}`;
    await click({ exposureToken: "t", impressionEventId: "not-a-uuid" }, ip);
    await click({ exposureToken: "t", impressionEventId: "123e4567-e89b-12d3-a456-426614174000" }, ip);
    expect(recordClick.mock.calls[0][1].impressionEventId).toBeNull();
    expect(recordClick.mock.calls[1][1].impressionEventId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("비로그인 허용 유지 + 같은 IP 분당 60회 초과 = 429, 다른 IP 는 영향 없음", async () => {
    const ip = `10.9.9.${ipSeq}`;
    for (let i = 0; i < 60; i += 1) {
      expect((await click({ exposureToken: "t" }, ip)).status).toBe(200);
    }
    const limited = await click({ exposureToken: "t" }, ip);
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("delivery_ad_click_rate_limited");
    expect((await click({ exposureToken: "t" }, `10.8.8.${ipSeq}`)).status).toBe(200);
  });
});
