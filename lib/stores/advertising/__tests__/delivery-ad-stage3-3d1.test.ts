/**
 * 3단계 3-D(1) — ADS-08 · ADS-06 · ADS-01 · ADS-11 · ADS-12 · ADS-02 (웹 부분).
 * DB 부분(승인 기간 재계산·만료 자동 반려·스냅샷 결합)은 supabase/tests/isolated/stage3-3d1/run.sh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const requireAdminPermission = vi.fn();
const requireAdminApiUser = vi.fn();
const adminTransitionDeliveryAdCampaign = vi.fn();
const adminApprovePartnerMembership = vi.fn();
const adminActOnPlatformPopupOwnerRequest = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/admin-delivery-ad-writer")>()),
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-partner-membership-writer", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/delivery-ad-partner-membership-writer")>()),
  adminApprovePartnerMembership: (...a: unknown[]) => adminApprovePartnerMembership(...a),
}));
vi.mock("@/lib/platform-popup/owner-request-approve", () => ({
  adminActOnPlatformPopupOwnerRequest: (...a: unknown[]) => adminActOnPlatformPopupOwnerRequest(...a),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: vi.fn(async () => undefined),
}));

import { POST as adActionsPost } from "@/app/api/admin/delivery-ads/[campaignId]/actions/route";
import { POST as partnerPost } from "@/app/api/admin/delivery-ads/partner/memberships/route";
import { POST as popupActionsPost } from "@/app/api/admin/platform-popup-requests/[requestId]/actions/route";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import { evaluateBannerPhysicalInventoryExposure } from "@/lib/stores/advertising/banner-physical-inventory-exposure";
import {
  isBannerStoreEligible,
  loadEligibleBannerStoreIds,
} from "@/lib/stores/advertising/load-banner-store-eligibility";
import {
  DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO,
  isDeliveryAdEndDueEligible,
  isDeliveryAdExpireUnreviewedEligible,
  runDeliveryAdSchedulePromoterBatch,
} from "@/lib/stores/advertising/delivery-ad-schedule-promoter";
import { canTransitionDeliveryAdLifecycle } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { adminListBucketWithFunding } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { deliveryAdApprovalWindowPreview } from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { updateOwnerSponsoredDraft } from "@/lib/stores/advertising/owner-store-sponsored-writer";

const FORBIDDEN = () => ({
  ok: false,
  response: NextResponse.json({ ok: false, error: "forbidden_permission" }, { status: 403 }),
});

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
  requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-1" }, sb: {} });
});

describe("ADS-08 — 광고 승인·반려(환불) 관리자 라우트는 business 권한키 필수", () => {
  it("delivery-ads actions: 권한 없음 → 403, writer 미호출", async () => {
    requireAdminPermission.mockResolvedValue(FORBIDDEN());
    const res = await adActionsPost(
      jsonReq("https://x.test/api/admin/delivery-ads/c1/actions", {
        action: "approve",
        productKind: "store_sponsored",
        expectedLifecycle: "UNDER_REVIEW",
        expectedUpdatedAt: "2026-10-21T00:00:00Z",
        reason: "ok",
      }),
      { params: Promise.resolve({ campaignId: "c1" }) }
    );
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it("delivery-ads actions: business 권한 → permission actor 로 writer 호출", async () => {
    adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: true, campaignId: "c1" });
    const res = await adActionsPost(
      jsonReq("https://x.test/api/admin/delivery-ads/c1/actions", {
        action: "approve",
        productKind: "store_sponsored",
        expectedLifecycle: "UNDER_REVIEW",
        expectedUpdatedAt: "2026-10-21T00:00:00Z",
        reason: "ok",
      }),
      { params: Promise.resolve({ campaignId: "c1" }) }
    );
    expect(res.status).toBe(200);
    expect(adminTransitionDeliveryAdCampaign.mock.calls[0][1]).toMatchObject({ adminUserId: "admin-1" });
  });

  it.each([["period_expired"], ["period_ended"]])("delivery-ads actions: %s → 422", async (error) => {
    adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: false, error });
    const res = await adActionsPost(
      jsonReq("https://x.test/api/admin/delivery-ads/c1/actions", {
        action: "resume",
        productKind: "banner",
        expectedLifecycle: "PAUSED_ADMIN",
        expectedUpdatedAt: "2026-10-21T00:00:00Z",
      }),
      { params: Promise.resolve({ campaignId: "c1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("partner memberships POST: 권한 없음 → 403", async () => {
    requireAdminPermission.mockResolvedValue(FORBIDDEN());
    const res = await partnerPost(
      jsonReq("https://x.test/api/admin/delivery-ads/partner/memberships", { op: "approve", membershipId: "m1" })
    );
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(adminApprovePartnerMembership).not.toHaveBeenCalled();
  });

  it("platform popup actions: 권한 없음 → 403", async () => {
    requireAdminPermission.mockResolvedValue(FORBIDDEN());
    const res = await popupActionsPost(
      jsonReq("https://x.test/api/admin/platform-popup-requests/r1/actions", { action: "approve", reason: "ok" }),
      { params: Promise.resolve({ requestId: "r1" }) }
    );
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(adminActOnPlatformPopupOwnerRequest).not.toHaveBeenCalled();
  });
});

describe("ADS-06 — 홈 히어로·물리 인벤토리 배너는 매장 자격(approved·is_visible) 검사", () => {
  const nowMs = Date.parse("2026-10-21T00:00:00Z");
  const base = {
    id: "b1",
    lifecycleStatus: "ACTIVE" as const,
    reviewStatus: "APPROVED" as const,
    startAt: "2026-10-20T00:00:00Z",
    endAt: "2026-10-27T00:00:00Z",
    creativeAssetPath: "delivery-ads/creatives/a.png",
    creativeReviewStatus: "APPROVED" as const,
    ctaHref: "/stores/s1",
    storeId: "store-1",
    campaignSource: "DIBAY_FIRST_PARTY",
    fundingStatus: null,
  };

  it("자격 없는 매장(정지·비노출) → store_eligible 로 제외, 자격 매장은 노출 사유 없음", () => {
    const hero = { ...base, inventoryKeys: ["STORES_HOME_HERO"] };
    const blocked = evaluateBannerHomeHeroExposure({ campaign: hero, nowMs, eligibleStoreIds: new Set() });
    expect(blocked.reasons).toContain("store_eligible");
    const allowed = evaluateBannerHomeHeroExposure({
      campaign: hero,
      nowMs,
      eligibleStoreIds: new Set(["store-1"]),
    });
    expect(allowed.reasons).not.toContain("store_eligible");

    const physical = evaluateBannerPhysicalInventoryExposure({
      campaign: { ...base, inventoryKeys: ["STORES_HOME_INLINE_1"] },
      inventoryKey: "STORES_HOME_INLINE_1" as never,
      physicalEnabled: true,
      nowMs,
      eligibleStoreIds: new Set(),
    });
    expect(physical.reasons).toContain("store_eligible");
  });

  it("매장 없는 플랫폼 배너는 자격 검사 대상 아님 · 미전달은 기존 동작", () => {
    expect(isBannerStoreEligible(null, new Set())).toBe(true);
    expect(isBannerStoreEligible("store-1", undefined)).toBe(true);
    expect(isBannerStoreEligible("store-1", new Set(["store-2"]))).toBe(false);
  });

  it("loadEligibleBannerStoreIds: approved·is_visible 조건 조회, 오류 → 빈 집합(fail-closed)", async () => {
    const calls: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      in: (_c: string, v: unknown) => (calls.push(["in", v]), builder),
      eq: (c: string, v: unknown) => (calls.push([c, v]), builder),
      neq: (c: string, v: unknown) => (calls.push([`neq:${c}`, v]), builder),
      then: (r: (v: unknown) => void) => r({ data: [{ id: "store-1" }], error: null }),
    };
    const sb = { from: () => builder } as unknown as SupabaseClient;
    const ids = await loadEligibleBannerStoreIds(sb, ["store-1", "store-2", null, "store-1"]);
    expect([...ids]).toEqual(["store-1"]);
    expect(calls).toContainEqual(["approval_status", "approved"]);
    expect(calls).toContainEqual(["is_visible", true]);
    expect(calls).toContainEqual(["neq:store_kind", "legacy_test"]);

    const errBuilder = {
      select: () => errBuilder,
      in: () => errBuilder,
      eq: () => errBuilder,
      neq: () => errBuilder,
      then: (r: (v: unknown) => void) => r({ data: null, error: { message: "boom" } }),
    };
    const errSb = { from: () => errBuilder } as unknown as SupabaseClient;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await loadEligibleBannerStoreIds(errSb, ["store-1"])).size).toBe(0);
    spy.mockRestore();
  });
});

describe("ADS-01 · ADS-11 — 기존 스케줄 크론의 만료 미심사 반려·일시중지 종료 (D-5 적용 시점 이후만)", () => {
  const nowMs = Date.parse("2026-11-01T00:00:00Z");

  it("system 전이 표: PAUSED_*→ENDED, 미심사→REJECTED", () => {
    expect(canTransitionDeliveryAdLifecycle("PAUSED_OWNER", "ENDED", "system")).toBe(true);
    expect(canTransitionDeliveryAdLifecycle("PAUSED_ADMIN", "ENDED", "system")).toBe(true);
    expect(canTransitionDeliveryAdLifecycle("SUBMITTED", "REJECTED", "system")).toBe(true);
    expect(canTransitionDeliveryAdLifecycle("UNDER_REVIEW", "REJECTED", "system")).toBe(true);
    expect(canTransitionDeliveryAdLifecycle("CHANGES_REQUESTED", "REJECTED", "system")).toBe(true);
    expect(canTransitionDeliveryAdLifecycle("ACTIVE", "REJECTED", "system")).toBe(false);
  });

  it("일시중지 end_due: 적용 시점 이후 종료분만", () => {
    expect(
      isDeliveryAdEndDueEligible({ lifecycleStatus: "PAUSED_OWNER", endAtIso: "2026-10-25T00:00:00Z", nowMs })
    ).toBe(true);
    expect(
      isDeliveryAdEndDueEligible({ lifecycleStatus: "PAUSED_ADMIN", endAtIso: "2026-09-08T00:00:00Z", nowMs })
    ).toBe(false);
    expect(
      isDeliveryAdEndDueEligible({ lifecycleStatus: "PAUSED_OWNER", endAtIso: "2026-11-02T00:00:00Z", nowMs })
    ).toBe(false);
  });

  it("expire_unreviewed: 기간 경과 + 적용 시점 이후 제출만 (기존 4건 ₱480 은 제외)", () => {
    expect(
      isDeliveryAdExpireUnreviewedEligible({
        lifecycleStatus: "UNDER_REVIEW",
        endAtIso: "2026-10-28T00:00:00Z",
        submittedAtIso: "2026-10-21T00:00:00Z",
        nowMs,
      })
    ).toBe(true);
    expect(
      isDeliveryAdExpireUnreviewedEligible({
        lifecycleStatus: "SUBMITTED",
        endAtIso: "2026-09-08T00:00:00Z",
        submittedAtIso: "2026-09-01T03:20:17Z",
        nowMs,
      })
    ).toBe(false);
    expect(
      isDeliveryAdExpireUnreviewedEligible({
        lifecycleStatus: "SUBMITTED",
        endAtIso: "2026-11-05T00:00:00Z",
        submittedAtIso: "2026-10-21T00:00:00Z",
        nowMs,
      })
    ).toBe(false);
    expect(DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO).toBe("2026-10-20T20:30:00.000Z");
  });

  it("배치: 미심사 만료 후보를 expire_unreviewed 로 DB 함수에 넘기고 expired 집계", async () => {
    const queries: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
    const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => ({
      data: {
        ok: true,
        campaign_id: args.p_campaign_id,
        from: args.p_expected_lifecycle,
        to: args.p_action === "expire_unreviewed" ? "REJECTED" : "ENDED",
        audit_id: "a1",
      },
      error: null,
    }));
    const sb = {
      rpc,
      from: (table: string) => {
        const q = { table, filters: [] as Array<[string, string, unknown]> };
        queries.push(q);
        const b = {
          select: () => b,
          limit: () => b,
          order: () => b,
          eq: (c: string, v: unknown) => (q.filters.push(["eq", c, v]), b),
          in: (c: string, v: unknown) => (q.filters.push(["in", c, v]), b),
          lte: (c: string, v: unknown) => (q.filters.push(["lte", c, v]), b),
          gte: (c: string, v: unknown) => (q.filters.push(["gte", c, v]), b),
          gt: (c: string, v: unknown) => (q.filters.push(["gt", c, v]), b),
          then: (r: (v: unknown) => void) => {
            const lifecycle = q.filters.find((f) => f[1] === "lifecycle_status");
            const isUnreviewed =
              Array.isArray(lifecycle?.[2]) && (lifecycle?.[2] as string[]).includes("UNDER_REVIEW");
            const rows =
              isUnreviewed && table === "store_paid_ad_campaigns"
                ? [
                    {
                      id: "c-exp",
                      lifecycle_status: "UNDER_REVIEW",
                      // 실제 시계 기준 후보 필터 → 기간이 이미 지난 적용 시점 이후 제출 건
                      start_at: "2026-10-20T21:00:00Z",
                      end_at: "2026-10-21T00:30:00Z",
                      updated_at: "2026-10-20T21:00:00Z",
                      submitted_at: "2026-10-20T21:00:00Z",
                    },
                  ]
                : [];
            return r({ data: rows, error: null });
          },
        };
        return b;
      },
    } as unknown as SupabaseClient;

    const out = await runDeliveryAdSchedulePromoterBatch(sb, { batchSize: 50, nowMs });
    expect(out.expired).toBe(1);
    expect(rpc).toHaveBeenCalledWith(
      "delivery_ad_system_schedule_transition",
      expect.objectContaining({ p_action: "expire_unreviewed", p_campaign_id: "c-exp", p_expected_lifecycle: "UNDER_REVIEW" })
    );
    const unreviewedQ = queries.find((q) =>
      q.filters.some((f) => f[1] === "submitted_at" && f[0] === "gte" && f[2] === DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO)
    );
    expect(unreviewedQ).toBeTruthy();
    const pausedQ = queries.find((q) =>
      q.filters.some((f) => f[1] === "lifecycle_status" && Array.isArray(f[2]) && (f[2] as string[]).includes("PAUSED_OWNER"))
    );
    expect(pausedQ?.filters).toContainEqual(["gte", "end_at", DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO]);
  });

  it("승인 용량 확인 기간 미리보기 = 승인 시점 기준 이동 (길이 유지)", () => {
    const w = deliveryAdApprovalWindowPreview({
      startAt: "2026-10-20T00:00:00.000Z",
      endAt: "2026-10-27T00:00:00.000Z",
      nowMs: Date.parse("2026-10-23T00:00:00.000Z"),
    });
    expect(w).toEqual({ startAt: "2026-10-23T00:00:00.000Z", endAt: "2026-10-30T00:00:00.000Z" });
    const future = deliveryAdApprovalWindowPreview({
      startAt: "2026-10-25T00:00:00.000Z",
      endAt: "2026-11-01T00:00:00.000Z",
      nowMs: Date.parse("2026-10-23T00:00:00.000Z"),
    });
    expect(future.startAt).toBe("2026-10-25T00:00:00.000Z");
  });
});

describe("ADS-12 — 미펀딩 레거시 심사 행은 별도 버킷", () => {
  it("OWNER_PAID review + 펀딩 없음 → review_unfunded, 조회 실패·펀딩·자사는 review 유지", () => {
    expect(adminListBucketWithFunding("review", { campaignSource: "OWNER_PAID", fundingSecured: false })).toBe(
      "review_unfunded"
    );
    expect(adminListBucketWithFunding("review", { campaignSource: "OWNER_PAID", fundingSecured: true })).toBe("review");
    expect(adminListBucketWithFunding("review", { campaignSource: "OWNER_PAID", fundingSecured: null })).toBe("review");
    expect(
      adminListBucketWithFunding("review", { campaignSource: "DIBAY_FIRST_PARTY", fundingSecured: false })
    ).toBe("review");
    expect(adminListBucketWithFunding("active", { campaignSource: "OWNER_PAID", fundingSecured: false })).toBe("active");
  });
});

describe("ADS-02 — 유료 신청 기간·인벤토리 직접 수정 금지", () => {
  function fakeSb() {
    const row = {
      id: "c1",
      store_id: "s1",
      owner_user_id: "o1",
      lifecycle_status: "DRAFT",
      review_status: "NOT_SUBMITTED",
      placement: "stores_home",
      start_at: "2026-10-22T00:00:00Z",
      end_at: "2026-10-29T00:00:00Z",
    };
    const rpc = vi.fn();
    const sb = {
      rpc,
      from: (table: string) => {
        const b = {
          select: () => b,
          eq: () => b,
          in: () => b,
          maybeSingle: async () => ({ data: table === "store_paid_ad_campaigns" ? row : null, error: null }),
          then: (r: (v: unknown) => void) =>
            r({
              data:
                table === "delivery_store_sponsored_campaign_inventories"
                  ? [{ inventory_id: "i1" }]
                  : table === "delivery_ad_inventories"
                    ? [{ key: "STORES_HOME_FEED" }]
                    : [],
              error: null,
            }),
        };
        return b;
      },
    } as unknown as SupabaseClient;
    return { sb, rpc };
  }

  it("start/end 수정 → schedule_locked (DB 미호출)", async () => {
    const { sb, rpc } = fakeSb();
    const res = await updateOwnerSponsoredDraft(sb, {
      campaignId: "c1",
      ownerUserId: "o1",
      endAtIso: "2027-01-01T00:00:00Z",
    });
    expect(res).toEqual({ ok: false, error: "schedule_locked" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("다중 인벤토리 → inventory_single_required (DB 미호출)", async () => {
    const { sb, rpc } = fakeSb();
    const res = await updateOwnerSponsoredDraft(sb, {
      campaignId: "c1",
      ownerUserId: "o1",
      inventoryKeys: ["STORES_HOME_FEED", "STORES_CATEGORY_FEED"],
    });
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/inventory_single_required|invalid_inventory/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
