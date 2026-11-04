/**
 * AL-01 · AL-04 · AL-05 · AL-06 — 배달 광고 도메인 관리자 라우트 동작 시험.
 * 종료(L3 · 사유 + 귀책 · 진행 중이면 환급 함수) · 재개(L2 사유) · 연장(L2 사유) · 초안 삭제(공통 함수).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPermission = vi.fn(async () => ({ ok: true, actor: { userId: "admin-1" } }));
const adminTransitionDeliveryAdCampaign = vi.fn();
const adminDeleteDeliveryAdDraftGuarded = vi.fn();
const adminExtendDeliveryAdCampaign = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: () => requireAdminPermission(),
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: vi.fn(async () => ({ ok: true, userId: "admin-1" })),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/admin-delivery-ad-writer")>()),
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-delete", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/admin-delivery-ad-delete")>()),
  adminDeleteDeliveryAdDraftGuarded: (...a: unknown[]) => adminDeleteDeliveryAdDraftGuarded(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-extension-writer", () => ({
  adminExtendDeliveryAdCampaign: (...a: unknown[]) => adminExtendDeliveryAdCampaign(...a),
}));

/** 캠페인 행 1개 + rpc 기록. */
let campaignRow: Record<string, unknown> | null = null;
const rpc = vi.fn();
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: campaignRow, error: null }),
      };
      return q;
    },
  }),
}));

import { POST as actionsPost } from "@/app/api/admin/delivery-ads/[campaignId]/actions/route";
import { POST as extendPost } from "@/app/api/admin/delivery-ads/[campaignId]/extend/route";

const UPDATED = "2026-11-01T00:00:00Z";
const ctx = { params: Promise.resolve({ campaignId: "c1" }) };

function req(path: string, body: unknown) {
  return new Request(`https://x.test/api/admin/delivery-ads/c1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function endBody(extra: Record<string, unknown> = {}) {
  return {
    action: "end",
    productKind: "banner",
    expectedLifecycle: "ACTIVE",
    expectedUpdatedAt: UPDATED,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  campaignRow = { id: "c1", lifecycle_status: "ACTIVE", updated_at: UPDATED };
  rpc.mockResolvedValue({
    data: { ok: true, preview: false, refund_amount: 500, paid_amount: 1000, remaining_seconds: 3600 },
    error: null,
  });
});

describe("AL-04 종료 (도메인 actions 라우트)", () => {
  it("진행 중 종료: 사유 없음 → 400 reason_required · 환급 함수·전이 함수 안 부름", async () => {
    const res = await actionsPost(req("actions", endBody({ fault: "operator" })), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("reason_required");
    expect(rpc).not.toHaveBeenCalled();
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it("진행 중 종료: 귀책 없음 → 400 fault_required", async () => {
    const res = await actionsPost(req("actions", endBody({ reason: "운영 오류" })), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("fault_required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("미리보기(preview) → 사유 없이 p_preview=true 로 환급 함수 · 금액 반환", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, preview: true, refund_amount: 777, paid_amount: 1000, remaining_seconds: 60 },
      error: null,
    });
    const res = await actionsPost(req("actions", endBody({ fault: "operator", preview: true })), ctx);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_delivery_ad_end_with_refund", {
      p_campaign_id: "c1",
      p_admin_id: "admin-1",
      p_fault: "operator",
      p_reason: "",
      p_preview: true,
    });
    expect((await res.json()).result).toMatchObject({ preview: true, refundAmount: 777, paidAmount: 1000 });
  });

  it("실행 → 사유·귀책 그대로 환급 함수 · 전이 함수 안 부름", async () => {
    const res = await actionsPost(req("actions", endBody({ fault: "member", reason: "사장님 요청 종료" })), ctx);
    expect(res.status).toBe(200);
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({
      p_fault: "member",
      p_reason: "사장님 요청 종료",
      p_preview: false,
    });
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it("이미 종료(DB already_ended) → 409", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "already_ended" }, error: null });
    const res = await actionsPost(req("actions", endBody({ fault: "none", reason: "중복 종료" })), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_ended");
  });

  it("화면 상태와 서버 상태가 다르면 409 stale_lifecycle", async () => {
    campaignRow = { id: "c1", lifecycle_status: "ENDED", updated_at: UPDATED };
    const res = await actionsPost(req("actions", endBody({ fault: "none", reason: "종료" })), ctx);
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("예약(SCHEDULED) 종료: 사유 없음 → 400 · 사유 있으면 기존 전이 함수", async () => {
    campaignRow = { id: "c1", lifecycle_status: "SCHEDULED", updated_at: UPDATED };
    const bad = await actionsPost(req("actions", endBody({ expectedLifecycle: "SCHEDULED" })), ctx);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("reason_required");
    adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: true, campaignId: "c1" });
    const ok = await actionsPost(
      req("actions", endBody({ expectedLifecycle: "SCHEDULED", reason: "노출 전 취소" })),
      ctx
    );
    expect(ok.status).toBe(200);
    expect(adminTransitionDeliveryAdCampaign.mock.calls[0][1]).toMatchObject({ action: "end", reason: "노출 전 취소" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("AL-05 재개 = L2", () => {
  it("사유 없음 → 400 reason_required · 사유 있으면 전이 함수에 사유 전달", async () => {
    const body = { action: "resume", productKind: "banner", expectedLifecycle: "PAUSED_ADMIN", expectedUpdatedAt: UPDATED };
    const bad = await actionsPost(req("actions", body), ctx);
    expect(bad.status).toBe(400);
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
    adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: true, campaignId: "c1" });
    const ok = await actionsPost(req("actions", { ...body, reason: "점검 끝" }), ctx);
    expect(ok.status).toBe(200);
    expect(adminTransitionDeliveryAdCampaign.mock.calls[0][1]).toMatchObject({ action: "resume", reason: "점검 끝" });
  });
});

describe("AL-06 연장 = L2", () => {
  it("사유 없음·1자 → 400 reason_required · writer 안 부름", async () => {
    for (const reason of [undefined, "a"]) {
      const res = await extendPost(
        req("extend", {
          productKind: "banner",
          expectedUpdatedAt: UPDATED,
          requestedDays: 3,
          extensionKind: "ADMIN_FREE_COMPENSATION",
          reason,
        }),
        ctx
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("reason_required");
    }
    expect(adminExtendDeliveryAdCampaign).not.toHaveBeenCalled();
  });
});

describe("AL-01 초안 삭제 = 공통 함수", () => {
  it("도메인 라우트는 adminDeleteDeliveryAdDraftGuarded 를 부르고 오류 코드·상태를 그대로 돌려준다", async () => {
    adminDeleteDeliveryAdDraftGuarded.mockResolvedValue({ ok: false, error: "not_admin_direct", httpStatus: 422 });
    const res = await actionsPost(
      req("actions", {
        action: "delete_safe_draft",
        productKind: "banner",
        expectedLifecycle: "DRAFT",
        expectedUpdatedAt: UPDATED,
        reason: "잘못 만듦",
      }),
      ctx
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "not_admin_direct" });
    expect(adminDeleteDeliveryAdDraftGuarded).toHaveBeenCalledWith(expect.anything(), {
      adminUserId: "admin-1",
      productKind: "banner",
      campaignId: "c1",
      expectedLifecycle: "DRAFT",
      expectedUpdatedAt: UPDATED,
      reason: "잘못 만듦",
    });
  });
});
