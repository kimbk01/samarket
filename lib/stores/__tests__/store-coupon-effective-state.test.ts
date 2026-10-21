import { describe, expect, it } from "vitest";
import {
  checkOwnerCouponTransition,
  effectiveCouponState,
  isCouponClaimableState,
  parseCouponClientRequestId,
  readStoreCouponMaxUsesPerUser,
} from "@/lib/stores/store-coupon-effective-state";
import {
  parseStoreCouponCampaignCreateBody,
  parseStoreCouponCampaignUpdateBody,
} from "@/lib/stores/store-coupon-campaign-validation";
import { ownerCouponDetailActions, ownerCouponListStatus, ownerCouponListTab } from "@/lib/stores/owner-coupon-list-bucket";

const NOW = Date.parse("2026-10-21T06:00:00.000Z");
const WIN = { start_at: "2026-10-01T00:00:00.000Z", end_at: "2026-11-01T00:00:00.000Z" };

describe("3-C ADS-23 effectiveCouponState (claim_store_coupon 과 같은 판정)", () => {
  it("active + window + is_active → active (claimable)", () => {
    const row = { lifecycle_state: "active", is_active: true, ...WIN };
    expect(effectiveCouponState(row, NOW)).toBe("active");
    expect(isCouponClaimableState(row, NOW)).toBe(true);
  });

  it("lifecycle active 인데 end_at 지남 → ended (운영 40건 유형), claim 불가", () => {
    const row = { lifecycle_state: "active", is_active: true, start_at: WIN.start_at, end_at: "2026-09-25T03:40:00Z" };
    expect(effectiveCouponState(row, NOW)).toBe("ended");
    expect(isCouponClaimableState(row, NOW)).toBe(false);
    expect(ownerCouponListTab(row, NOW)).toBe("ended");
  });

  it("lifecycle active + is_active=false → inactive (운영 13건 유형), 목록은 일시정지 표시, claim 불가", () => {
    const row = { lifecycle_state: "active", is_active: false, ...WIN };
    expect(effectiveCouponState(row, NOW)).toBe("inactive");
    expect(isCouponClaimableState(row, NOW)).toBe(false);
    expect(ownerCouponListStatus(row, NOW)).toBe("paused");
  });

  it("scheduled with start passed → active (claim 은 scheduled 도 허용)", () => {
    expect(effectiveCouponState({ lifecycle_state: "scheduled", is_active: true, ...WIN }, NOW)).toBe("active");
  });

  it("future start → scheduled; revoked/ended 은 기간과 무관하게 유지", () => {
    expect(
      effectiveCouponState({ lifecycle_state: "active", is_active: true, start_at: "2026-10-30T00:00:00Z", end_at: WIN.end_at }, NOW)
    ).toBe("scheduled");
    expect(effectiveCouponState({ lifecycle_state: "revoked", is_active: true, ...WIN }, NOW)).toBe("revoked");
    expect(effectiveCouponState({ lifecycle_state: "ended", is_active: true, ...WIN }, NOW)).toBe("ended");
    expect(isCouponClaimableState({ lifecycle_state: "paused", is_active: true, ...WIN }, NOW)).toBe(false);
  });
});

describe("3-C IA-04 owner transition table (D-18 권장안)", () => {
  it("ended / revoked cannot be paused, resumed or ended", () => {
    for (const st of ["ended", "revoked", "rejected"]) {
      for (const a of ["pause", "resume", "end"] as const) {
        const r = checkOwnerCouponTransition(a, { lifecycle_state: st, is_active: false });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(409);
      }
    }
  });

  it("admin-paused → owner resume 403; owner-paused / legacy NULL → resume ok", () => {
    const admin = checkOwnerCouponTransition("resume", { lifecycle_state: "paused", paused_by: "admin" });
    expect(admin).toEqual({ ok: false, error: "admin_paused_resume_forbidden", status: 403 });
    expect(checkOwnerCouponTransition("resume", { lifecycle_state: "paused", paused_by: "owner" }).ok).toBe(true);
    expect(checkOwnerCouponTransition("resume", { lifecycle_state: "paused", paused_by: null }).ok).toBe(true);
    expect(checkOwnerCouponTransition("end", { lifecycle_state: "paused", paused_by: "admin" }).ok).toBe(true);
  });

  it("pause needs active + is_active (legacy inactive rows cannot be revived via pause→resume)", () => {
    expect(checkOwnerCouponTransition("pause", { lifecycle_state: "active", is_active: true }).ok).toBe(true);
    expect(checkOwnerCouponTransition("pause", { lifecycle_state: "active", is_active: false }).ok).toBe(false);
  });

  it("detail actions follow the table", () => {
    expect(ownerCouponDetailActions("paused", { row: { lifecycle_state: "paused", paused_by: "admin" } })).toEqual([
      "end",
      "reissue",
    ]);
    expect(ownerCouponDetailActions("paused", { row: { lifecycle_state: "active", is_active: false } })).toEqual([
      "end",
      "reissue",
    ]);
    expect(ownerCouponDetailActions("ended", { row: { lifecycle_state: "active", is_active: true } })).toEqual([
      "reissue",
    ]);
    expect(ownerCouponDetailActions("active", { row: { lifecycle_state: "active", is_active: true } })).toEqual([
      "pause",
      "end",
      "reissue",
    ]);
  });
});

describe("3-C ADS-24 max_uses_per_user = 1 only", () => {
  const base = {
    storeId: "s1",
    title: "t",
    discountType: "fixed_amount",
    discountValue: 10,
    startAt: "2026-10-21T00:00:00.000Z",
    endAt: "2026-11-21T00:00:00.000Z",
  };
  it("create: 1 / absent ok, 2 → unsupported_max_uses", () => {
    expect(readStoreCouponMaxUsesPerUser({})).toEqual({ ok: true });
    expect(parseStoreCouponCampaignCreateBody({ ...base, maxUsesPerUser: 1 }).ok).toBe(true);
    expect(parseStoreCouponCampaignCreateBody({ ...base, max_uses_per_user: 2 })).toEqual({
      ok: false,
      error: "unsupported_max_uses",
    });
    expect(parseStoreCouponCampaignCreateBody({ ...base, maxUsesPerUser: "3" })).toEqual({
      ok: false,
      error: "unsupported_max_uses",
    });
  });
  it("update: 2 → unsupported_max_uses", () => {
    expect(parseStoreCouponCampaignUpdateBody({ id: "c1", max_uses_per_user: 2 })).toEqual({
      ok: false,
      error: "unsupported_max_uses",
    });
  });
});

describe("3-C IA-05 client request id", () => {
  it("accepts 8..128 safe chars only", () => {
    expect(parseCouponClientRequestId("reissue-0d3c9a1e")).toBe("reissue-0d3c9a1e");
    expect(parseCouponClientRequestId("short")).toBeNull();
    expect(parseCouponClientRequestId("x".repeat(129))).toBeNull();
    expect(parseCouponClientRequestId("has space 123")).toBeNull();
    expect(parseCouponClientRequestId(123)).toBeNull();
  });
});
