/**
 * 2026-11-19 예약 작업 1번 — 할 일 없는 실행은 `delivery_ads_cron_tick` 1번으로 끝난다.
 * 광고 후보가 있으면(schedule_due) 기존 순서 그대로(승격 → 정리 3개).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const audit = vi.fn(async (..._a: unknown[]) => undefined);
const promoter = vi.fn(async () => ({ ok: true, activated: 1, ended: 0, expired: 0, failed: 0, scanned: 1, results: [] }));
const partner = vi.fn(async () => ({ ok: true, ended: 0 }));
const couponEnd = vi.fn(async () => ({ ok: true, ended: 0 }));

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({ rpc }) }));
vi.mock("@/lib/stores/advertising/delivery-ad-schedule-promoter", () => ({
  runDeliveryAdSchedulePromoterBatch: (...a: unknown[]) => promoter(...(a as [])),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-partner-membership-writer", () => ({
  runPartnerMembershipExpiryBatch: (...a: unknown[]) => partner(...(a as [])),
}));
vi.mock("@/lib/stores/store-coupon-auto-end", () => ({
  runStoreCouponAutoEndBatch: (...a: unknown[]) => couponEnd(...(a as [])),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));

import { GET } from "@/app/api/cron/delivery-ads-schedule-transitions/route";
import {
  parseCouponAutoEnd,
  parseCouponExpire,
  parsePartnerExpiry,
} from "@/lib/stores/advertising/delivery-ads-cron-tick";

const req = () =>
  new Request("http://localhost/api/cron/delivery-ads-schedule-transitions", {
    headers: { authorization: "Bearer s3cret" },
  });

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  rpc.mockReset();
  audit.mockClear();
  promoter.mockClear();
  partner.mockClear();
  couponEnd.mockClear();
});

describe("광고 일정 전환 — 할 일 확인 1번", () => {
  it("할 일 없음: Supabase 1번 · 승격·정리 개별 호출 없음 · 감사 기록 없음", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        v: 1,
        schedule_due: false,
        partner: { ok: true, ended: 0 },
        coupon_auto_end: { ok: true, ended: 0 },
        coupon_expire: { ok: true, expired_count: 0, reserved_released: 0 },
      },
      error: null,
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("delivery_ads_cron_tick", {
      p_partner_limit: 200,
      p_coupon_end_limit: 500,
      p_coupon_expire_limit: 500,
    });
    expect(promoter).not.toHaveBeenCalled();
    expect(partner).not.toHaveBeenCalled();
    expect(couponEnd).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, activated: 0, scanned: 0, coupon_entitlements_expired: 0 });
  });

  it("후보 없음이어도 정리 결과가 있으면 감사 기록 · 응답에 결과", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        schedule_due: false,
        partner: { ok: true, ended: 2 },
        coupon_auto_end: { ok: true, ended: 1 },
        coupon_expire: { ok: true, expired_count: 3, reserved_released: 50 },
      },
      error: null,
    });
    const res = await GET(req());
    expect(await res.json()).toMatchObject({
      partnerMembershipsEnded: 2,
      coupon_auto_ended: 1,
      coupon_entitlements_expired: 3,
    });
    const row = audit.mock.calls[0]![1] as { after_json: Record<string, unknown> };
    expect(row.after_json).toMatchObject({ partner_memberships_ended: 2, coupon_reserved_released_php: 50 });
  });

  it("후보 있음: 기존 순서 그대로(승격 → 파트너 → 쿠폰 종료 → 쿠폰 만료)", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "delivery_ads_cron_tick"
        ? { data: { ok: true, schedule_due: true }, error: null }
        : { data: { ok: true, expired_count: 0, reserved_released: 0 }, error: null }
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(promoter).toHaveBeenCalledTimes(1);
    expect(partner).toHaveBeenCalledTimes(1);
    expect(couponEnd).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["delivery_ads_cron_tick", "expire_stale_coupon_entitlements"]);
    expect(await res.json()).toMatchObject({ activated: 1 });
  });

  it("함수 없음·오류: 기존 전체 경로로 처리", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "delivery_ads_cron_tick"
        ? { data: null, error: { message: "function does not exist" } }
        : { data: { ok: true, expired_count: 0, reserved_released: 0 }, error: null }
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await GET(req());
    expect(promoter).toHaveBeenCalledTimes(1);
    expect(partner).toHaveBeenCalledTimes(1);
    expect(couponEnd).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("tick 결과 해석 = 기존 함수 해석", () => {
  it("파트너: ok 아니면 실패", () => {
    expect(parsePartnerExpiry({ ok: true, ended: 3.7 })).toEqual({ ok: true, ended: 3 });
    expect(parsePartnerExpiry({ ok: false, error: "x" })).toEqual({ ok: false, error: "x" });
    expect(parsePartnerExpiry(null)).toEqual({ ok: false, error: "expire_failed" });
  });
  it("쿠폰 종료·만료: DB 오류만 실패", () => {
    expect(parseCouponAutoEnd({ ok: true, ended: 2 })).toEqual({ ok: true, ended: 2 });
    expect(parseCouponAutoEnd({ error: "boom" })).toEqual({ ok: false, error: "boom" });
    expect(parseCouponExpire({ expired_count: 1, reserved_released: 9 })).toEqual({
      ok: true,
      expired: 1,
      reservedReleased: 9,
    });
    expect(parseCouponExpire({ error: "boom" })).toEqual({ ok: false, error: "boom" });
  });
});
