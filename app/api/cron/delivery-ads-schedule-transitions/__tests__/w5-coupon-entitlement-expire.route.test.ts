/**
 * v4 W5 · DB-03 — 기존 쿠폰 lifecycle 크론(delivery-ads-schedule-transitions)이 쿠폰 만료 함수
 * `expire_stale_coupon_entitlements(500)` 를 함께 호출한다. 실패해도 광고 배치 응답은 200 유지 · 결과는 감사에 남긴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const audit = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({ rpc }) }));
vi.mock("@/lib/stores/advertising/delivery-ad-schedule-promoter", () => ({
  runDeliveryAdSchedulePromoterBatch: async () => ({
    activated: 0,
    ended: 0,
    expired: 0,
    failed: 0,
    scanned: 0,
    results: [],
  }),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-partner-membership-writer", () => ({
  runPartnerMembershipExpiryBatch: async () => ({ ok: true, ended: 0 }),
}));
vi.mock("@/lib/stores/store-coupon-auto-end", () => ({
  runStoreCouponAutoEndBatch: async () => ({ ok: true, ended: 0 }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));

import { GET } from "@/app/api/cron/delivery-ads-schedule-transitions/route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/delivery-ads-schedule-transitions", {
    headers: auth ? { authorization: auth } : {},
  });

const prevSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  rpc.mockReset();
  audit.mockClear();
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
});

describe("W5 DB-03 쿠폰 만료 배치 연결", () => {
  it("인증 없으면 401 · RPC 호출 없음", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("인증 시 expire_stale_coupon_entitlements(p_batch_limit 500) 1회 + 응답·감사에 결과", async () => {
    rpc.mockResolvedValue({ data: { ok: true, expired_count: 21, reserved_released: 2464 }, error: null });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("expire_stale_coupon_entitlements", { p_batch_limit: 500 });
    expect(await res.json()).toMatchObject({ ok: true, coupon_entitlements_expired: 21 });
    const row = audit.mock.calls[0]![1] as { after_json: Record<string, unknown> };
    expect(row.after_json).toMatchObject({ coupon_entitlements_expired: 21, coupon_reserved_released_php: 2464 });
  });

  it("RPC 오류(함수 미적용 등)·예외여도 크론 응답 200, 결과 null", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function does not exist" } });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, coupon_entitlements_expired: null });

    rpc.mockRejectedValueOnce(new Error("network"));
    const res2 = await GET(req("Bearer s3cret"));
    expect(res2.status).toBe(200);
  });
});
