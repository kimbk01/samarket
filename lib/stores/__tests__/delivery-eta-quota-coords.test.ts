/** ORD-C-16 — delivery-eta 사용자당 레이트 리밋(기존 enforceRateLimit) + 좌표 범위 검증 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const quota = vi.fn();
const getApprovedStoreBySlug = vi.fn();
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "buyer-1" }));
vi.mock("@/lib/security/rate-limit-presets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  enforceDeliveryEtaQuota: (...a: unknown[]) => quota(...a),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/get-approved-store-by-slug", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovedStoreBySlug: (...a: unknown[]) => getApprovedStoreBySlug(...a),
}));
vi.mock("@/lib/delivery/delivery-ops-settings", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadDeliveryRideTimeSource: async () => "store",
}));

function etaReq(qs: string) {
  return new Request(`http://x/api/stores/s1/delivery-eta?${qs}`);
}
const ctx = { params: Promise.resolve({ slug: "s1" }) };

describe("ORD-C-16 delivery-eta", () => {
  beforeEach(() => {
    quota.mockReset();
    quota.mockResolvedValue({ ok: true });
    getApprovedStoreBySlug.mockReset();
    getApprovedStoreBySlug.mockResolvedValue({ ok: false, reason: "not_found" });
  });

  it("레이트 리밋 초과 → 429 응답 그대로, 매장·경로 조회 없음", async () => {
    quota.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, code: "delivery_eta_rate_limited" }, { status: 429 }),
    });
    const { GET } = await import("@/app/api/stores/[slug]/delivery-eta/route");
    const res = await GET(etaReq("delivery_user_address_id=a1"), ctx);
    expect(res.status).toBe(429);
    expect(quota).toHaveBeenCalledWith("buyer-1");
    expect(getApprovedStoreBySlug).not.toHaveBeenCalled();
  });

  it.each([
    ["lat=91&lng=120"],
    ["lat=14.5&lng=181"],
    ["lat=abc&lng=121"],
    ["lat=14.5"],
    ["delivery_user_address_id=a1&lat=999&lng=121"],
  ])("범위 밖·불완전 좌표 %s → 400 invalid_coordinates", async (qs) => {
    const { GET } = await import("@/app/api/stores/[slug]/delivery-eta/route");
    const res = await GET(etaReq(qs), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_coordinates" });
    expect(getApprovedStoreBySlug).not.toHaveBeenCalled();
  });

  it("유효 좌표는 다음 단계(매장 조회)로 진행", async () => {
    const { GET } = await import("@/app/api/stores/[slug]/delivery-eta/route");
    const res = await GET(etaReq("lat=14.55&lng=121.02"), ctx);
    expect(res.status).toBe(404);
    expect(getApprovedStoreBySlug).toHaveBeenCalledTimes(1);
  });
});

describe("enforceDeliveryEtaQuota (기존 enforceRateLimit 재사용)", () => {
  it("사용자당 분당 60회까지 허용, 61번째 429", async () => {
    const real = await vi.importActual<typeof import("@/lib/security/rate-limit-presets")>(
      "@/lib/security/rate-limit-presets"
    );
    const uid = `quota-test-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      expect((await real.enforceDeliveryEtaQuota(uid)).ok).toBe(true);
    }
    const over = await real.enforceDeliveryEtaQuota(uid);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.response.status).toBe(429);
  });
});
