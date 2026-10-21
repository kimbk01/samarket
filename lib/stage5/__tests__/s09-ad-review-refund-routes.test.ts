/**
 * 5단계 S09 (L1) — 광고 제출·승인·반려·환불 (문서 G-2 §5-2 S09 · §5-4 3-D 게이트).
 *
 * 기존 L1 이 승인(approve) 권한키·기간 미리보기·미펀딩 버킷·원자 반려 writer 를 증명한다
 * (J 매트릭스 문서 참조). 이 파일은 비어 있던 셀만 채운다:
 *  - 반려(=환불) 라우트 3종(광고 actions · 파트너 · 팝업) business 권한키 없으면 403, writer/RPC 미호출
 *  - 권한 있는 반려: 사유가 writer 로 전달, 환불 실패는 성공으로 보고되지 않음(422/400), 감사는 성공 시 1행
 *  - 파트너 동시 결정: 두 번째 결정은 DB 가 illegal_transition → 400, 감사 0 (이중 환불·이중 감사 없음)
 *  - 주문자 노출: 승인 기간 밖·정지 매장 배너는 노출 사유 탈락
 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPermission = vi.fn();
const adminTransitionDeliveryAdCampaign = vi.fn();
const adminRejectPartnerMembership = vi.fn();
const adminActOnPlatformPopupOwnerRequest = vi.fn();
const appendAdminRouteAudit = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => ({ ok: true, userId: "admin-s09" }),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/admin-delivery-ad-writer")>()),
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-partner-membership-writer", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/delivery-ad-partner-membership-writer")>()),
  adminRejectPartnerMembership: (...a: unknown[]) => adminRejectPartnerMembership(...a),
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
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));

import { POST as adActionsPost } from "@/app/api/admin/delivery-ads/[campaignId]/actions/route";
import { POST as partnerPost } from "@/app/api/admin/delivery-ads/partner/memberships/route";
import { POST as popupActionsPost } from "@/app/api/admin/platform-popup-requests/[requestId]/actions/route";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";

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

const adReject = (extra: Record<string, unknown> = {}) =>
  adActionsPost(
    jsonReq("https://x.test/api/admin/delivery-ads/c1/actions", {
      action: "reject",
      productKind: "store_sponsored",
      expectedLifecycle: "UNDER_REVIEW",
      expectedUpdatedAt: "2026-10-21T00:00:00Z",
      reason: "creative policy",
      ...extra,
    }),
    { params: Promise.resolve({ campaignId: "c1" }) }
  );
const partnerReject = () =>
  partnerPost(
    jsonReq("https://x.test/api/admin/delivery-ads/partner/memberships", {
      op: "reject",
      membershipId: "m1",
      reason: "spam",
    })
  );
const popupReject = () =>
  popupActionsPost(
    jsonReq("https://x.test/api/admin/platform-popup-requests/r1/actions", { action: "reject", reason: "policy" }),
    { params: Promise.resolve({ requestId: "r1" }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-s09" }, sb: {} });
});

describe("S09 L1 — 반려(환불) 라우트 3종: business 권한키 필수 (ADS-08)", () => {
  it("광고 actions reject: 권한 없음 → 403, writer(반려+환불 RPC) 미호출", async () => {
    requireAdminPermission.mockResolvedValue(FORBIDDEN());
    const res = await adReject();
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it("파트너 reject: 권한 없음 → 403, 회비 환불 writer 미호출", async () => {
    requireAdminPermission.mockResolvedValue(FORBIDDEN());
    const res = await partnerReject();
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(adminRejectPartnerMembership).not.toHaveBeenCalled();
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("팝업 reject: 권한 없음 → 403, writer 미호출", async () => {
    requireAdminPermission.mockResolvedValue(FORBIDDEN());
    const res = await popupReject();
    expect(res.status).toBe(403);
    expect(adminActOnPlatformPopupOwnerRequest).not.toHaveBeenCalled();
  });
});

describe("S09 L1 — 권한 있는 반려: 사유 전달 · 환불 실패는 실패로", () => {
  it("광고 reject: business 권한 actor·사유가 writer 로 전달, 성공 200", async () => {
    adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: true, campaignId: "c1", from: "UNDER_REVIEW", to: "REJECTED" });
    const res = await adReject();
    expect(res.status).toBe(200);
    expect(adminTransitionDeliveryAdCampaign.mock.calls[0][1]).toMatchObject({
      adminUserId: "admin-s09",
      action: "reject",
      reason: "creative policy",
    });
  });

  it("광고 reject: 같은 TX 환불 실패(reject_refund_failed) → 2xx 아님 (상태 롤백을 성공으로 보고하지 않음)", async () => {
    adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: false, error: "reject_refund_failed" });
    const res = await adReject();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(((await res.json()) as { ok?: boolean }).ok).toBe(false);
  });

  it("팝업 reject: 사유 없으면 400 reason_required, writer 미호출", async () => {
    const res = await popupActionsPost(
      jsonReq("https://x.test/api/admin/platform-popup-requests/r1/actions", { action: "reject" }),
      { params: Promise.resolve({ requestId: "r1" }) }
    );
    expect(res.status).toBe(400);
    expect(adminActOnPlatformPopupOwnerRequest).not.toHaveBeenCalled();
  });
});

describe("S09 L1 — 파트너 동시 결정 (ADS-03): 두 번째 결정은 거부, 감사·환불 1회", () => {
  it("첫 reject 성공(감사 1) → 두 번째 reject 는 DB illegal_transition → 400, 추가 감사 0", async () => {
    adminRejectPartnerMembership
      .mockResolvedValueOnce({
        ok: true,
        membership: { id: "m1", storeId: "s1", status: "REJECTED" },
        refundIdempotent: false,
      })
      .mockResolvedValueOnce({ ok: false, error: "illegal_transition" });
    const first = await partnerReject();
    expect(first.status).toBe(200);
    expect(((await first.json()) as { refundIdempotent?: boolean }).refundIdempotent).toBe(false);
    const second = await partnerReject();
    expect(second.status).toBe(400);
    expect(((await second.json()) as { error?: string }).error).toBe("illegal_transition");
    expect(appendAdminRouteAudit).toHaveBeenCalledTimes(1);
    expect(adminRejectPartnerMembership.mock.calls[0][1]).toMatchObject({
      membershipId: "m1",
      actorUserId: "admin-s09",
      reason: "spam",
    });
  });
});

describe("S09 L1 — 주문자 노출: 승인 기간에만, 정지 매장 미노출", () => {
  const campaign = {
    id: "b1",
    lifecycleStatus: "ACTIVE" as const,
    reviewStatus: "APPROVED" as const,
    startAt: "2026-10-22T00:00:00Z",
    endAt: "2026-10-29T00:00:00Z",
    creativeAssetPath: "delivery-ads/creatives/a.png",
    creativeReviewStatus: "APPROVED" as const,
    ctaHref: "/stores/s1",
    storeId: "store-1",
    campaignSource: "DIBAY_FIRST_PARTY",
    fundingStatus: null,
    inventoryKeys: ["STORES_HOME_HERO"],
  };
  const eligible = new Set(["store-1"]);

  it.each([
    ["승인 기간 전", "2026-10-21T12:00:00Z", false],
    ["승인 기간 중", "2026-10-25T00:00:00Z", true],
    ["승인 기간 종료 후", "2026-10-29T00:00:01Z", false],
  ])("%s → schedule_active 판정 %s", (_label, now, inWindow) => {
    const r = evaluateBannerHomeHeroExposure({ campaign, nowMs: Date.parse(now), eligibleStoreIds: eligible });
    expect(r.reasons.includes("schedule_active")).toBe(!inWindow);
  });

  it.each(["REJECTED", "ENDED", "UNDER_REVIEW"] as const)(
    "반려·만료 자동 반려·미심사(%s) 캠페인은 기간 중이어도 노출 안 됨 (campaign_ACTIVE)",
    (lifecycleStatus) => {
      const r = evaluateBannerHomeHeroExposure({
        campaign: { ...campaign, lifecycleStatus: lifecycleStatus as never },
        nowMs: Date.parse("2026-10-25T00:00:00Z"),
        eligibleStoreIds: eligible,
      });
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain("campaign_ACTIVE");
    }
  );

  it("기간 중이어도 정지(자격 집합 밖) 매장 배너는 store_eligible 로 탈락", () => {
    const r = evaluateBannerHomeHeroExposure({
      campaign,
      nowMs: Date.parse("2026-10-25T00:00:00Z"),
      eligibleStoreIds: new Set(),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("store_eligible");
  });
});
