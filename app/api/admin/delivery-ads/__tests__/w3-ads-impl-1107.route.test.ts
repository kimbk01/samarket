/**
 * 광고 3차 구현 W3 (2026-11-07) — 배달 도메인 관리자 라우트·writer 동작 시험.
 * D-02 예약 종료 = 귀책·환급 함수 · D-03 진행 중 강제 종료 422 · D-09 목적지 수정 DS-6 · D-10 내부 메모 분리 ·
 * AD2-10 삭제 사유 필수 · AD2-11 삭제 = DB 함수 1번.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPermission = vi.fn(async () => ({ ok: true, actor: { userId: "admin-1" } }));
const adminTransitionDeliveryAdCampaign = vi.fn();
const persistAdvertisingAdminMemo = vi.fn(async () => ({ ok: true }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: () => requireAdminPermission(),
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: vi.fn(async () => ({ ok: true, userId: "admin-1" })),
}));
vi.mock("@/lib/ads/advertising-admin-memo", () => ({
  persistAdvertisingAdminMemo: (...a: unknown[]) => (persistAdvertisingAdminMemo as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/admin/advertising-workspace/workspace-memo-gate", () => ({
  advertisingWorkspaceMemoTargetType: (f: string) => `advertising:${f}`,
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores/advertising/admin-delivery-ad-writer")>()),
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
}));

let campaignRow: Record<string, unknown> | null = null;
const rpc = vi.fn();
const tableDeletes: string[] = [];
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        delete: () => {
          tableDeletes.push(table);
          return q;
        },
        maybeSingle: async () => ({ data: campaignRow, error: null }),
      };
      return q;
    },
  }),
}));

import { POST as actionsPost } from "@/app/api/admin/delivery-ads/[campaignId]/actions/route";
import {
  adminActionAllowed,
  isDeliveryAdInProgressLifecycle,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { isDeliveryAdLiveEndLifecycle } from "@/lib/stores/advertising/admin-delivery-ad-end";
import { adminDeleteDeliveryAdDraftGuarded } from "@/lib/stores/advertising/admin-delivery-ad-delete";

const UPDATED = "2026-11-01T00:00:00Z";
const ctx = { params: Promise.resolve({ campaignId: "c1" }) };

function req(body: unknown) {
  return new Request("https://x.test/api/admin/delivery-ads/c1/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  tableDeletes.length = 0;
  campaignRow = { id: "c1", lifecycle_status: "SCHEDULED", updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" };
  rpc.mockResolvedValue({
    data: { ok: true, preview: false, refund_amount: 1200, paid_amount: 1200, remaining_seconds: 86400 },
    error: null,
  });
  adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: true, campaignId: "c1", from: "ACTIVE", to: "PAUSED_ADMIN", action: "pause" });
});

describe("D-02 예약(SCHEDULED) 종료 = 귀책·비례 환급 함수", () => {
  it("SCHEDULED 는 진행 중 종료 상태다", () => {
    expect(isDeliveryAdLiveEndLifecycle("SCHEDULED")).toBe(true);
  });

  it("예약 + 운영 귀책 종료 → admin_delivery_ad_end_with_refund 호출 (전이 함수 아님)", async () => {
    const res = await actionsPost(
      req({
        action: "end",
        productKind: "banner",
        expectedLifecycle: "SCHEDULED",
        expectedUpdatedAt: UPDATED,
        fault: "operator",
        reason: "운영 오류로 종료",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_delivery_ad_end_with_refund", expect.objectContaining({ p_fault: "operator" }));
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it("예약 종료에 귀책이 없으면 400 fault_required", async () => {
    const res = await actionsPost(
      req({ action: "end", productKind: "banner", expectedLifecycle: "SCHEDULED", expectedUpdatedAt: UPDATED, reason: "종료 사유" }),
      ctx
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("fault_required");
  });
});

describe("D-03 진행 중 강제 종료(terminate) 금지", () => {
  it.each(["ACTIVE", "SCHEDULED", "PAUSED_OWNER", "PAUSED_ADMIN"] as const)("%s → terminate 버튼 판정 false", (s) => {
    expect(isDeliveryAdInProgressLifecycle(s)).toBe(true);
    expect(adminActionAllowed("terminate", s)).toBe(false);
    // 종료(end)는 그대로 된다
    expect(adminActionAllowed("end", s)).toBe(true);
  });

  it("ACTIVE terminate → 422 use_end_with_fault (writer 호출 없음)", async () => {
    const res = await actionsPost(
      req({ action: "terminate", productKind: "banner", expectedLifecycle: "ACTIVE", expectedUpdatedAt: UPDATED, reason: "강제 종료" }),
      ctx
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("use_end_with_fault");
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });
});

describe("D-10 공개 사유·내부 메모 분리 (사장님 응답에 내부 메모 0)", () => {
  it("정지: ownerVisibleNotes 에는 공개 사유만 · 내부 메모는 운영자 메모로만 저장", async () => {
    campaignRow = { id: "c1", lifecycle_status: "ACTIVE", updated_at: UPDATED };
    const res = await actionsPost(
      req({
        action: "pause",
        productKind: "banner",
        expectedLifecycle: "ACTIVE",
        expectedUpdatedAt: UPDATED,
        reason: "이미지 점검",
        ownerVisibleNotes: "이미지 점검",
        internalReason: "신고 3건 — 내부 확인",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const call = adminTransitionDeliveryAdCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(call.ownerVisibleNotes).toBe("이미지 점검");
    expect(JSON.stringify(call)).not.toContain("신고 3건");
    expect(persistAdvertisingAdminMemo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "internal", targetType: "advertising:delivery_banner", memo: "[pause] 신고 3건 — 내부 확인" })
    );
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("신고 3건");
  });

  it("내부 메모가 ownerVisibleNotes 로 잘못 와도 사장님 칸에는 공개 사유만", async () => {
    campaignRow = { id: "c1", lifecycle_status: "ACTIVE", updated_at: UPDATED };
    await actionsPost(
      req({
        action: "pause",
        productKind: "banner",
        expectedLifecycle: "ACTIVE",
        expectedUpdatedAt: UPDATED,
        reason: "점검",
        ownerVisibleNotes: "내부 전용",
        internalReason: "내부 전용",
      }),
      ctx
    );
    const call = adminTransitionDeliveryAdCampaign.mock.calls[0]![1] as Record<string, unknown>;
    expect(call.ownerVisibleNotes).toBe("점검");
  });
});

describe("AD2-10 · AD2-11 배달 초안 삭제", () => {
  it("라우트: 사유 없이 삭제 → 400 (예전: 통과)", async () => {
    campaignRow = { id: "c1", lifecycle_status: "DRAFT", updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" };
    const res = await actionsPost(
      req({ action: "delete_safe_draft", productKind: "banner", expectedLifecycle: "DRAFT", expectedUpdatedAt: UPDATED }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("함수: 사유 있음 → DB 함수 admin_delivery_ad_delete_draft 1번 · TS 가 표를 직접 지우지 않음", async () => {
    campaignRow = { id: "c1", lifecycle_status: "DRAFT", updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" };
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const sb = (await import("@/lib/stores/try-supabase-stores")).tryGetSupabaseForStores()!;
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, {
      adminUserId: "admin-1",
      productKind: "banner",
      campaignId: "c1",
      expectedLifecycle: "DRAFT",
      expectedUpdatedAt: UPDATED,
      reason: "잘못 만든 초안",
    });
    expect(res).toEqual({ ok: true, campaignId: "c1" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_delivery_ad_delete_draft", {
      p_campaign: "c1",
      p_admin: "admin-1",
      p_reason: "잘못 만든 초안",
    });
    expect(tableDeletes).toEqual([]);
  });

  it("함수: 사유 1자 → reason_required (DB 호출 없음)", async () => {
    campaignRow = { id: "c1", lifecycle_status: "DRAFT", updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" };
    const sb = (await import("@/lib/stores/try-supabase-stores")).tryGetSupabaseForStores()!;
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, {
      adminUserId: "admin-1",
      productKind: "banner",
      campaignId: "c1",
      expectedLifecycle: "DRAFT",
      expectedUpdatedAt: UPDATED,
      reason: "x",
    });
    expect(res).toMatchObject({ ok: false, error: "reason_required", httpStatus: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("함수: DB 함수 없음 → 503 rpc_missing · 삭제 폴백 없음", async () => {
    campaignRow = { id: "c1", lifecycle_status: "DRAFT", updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" };
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const sb = (await import("@/lib/stores/try-supabase-stores")).tryGetSupabaseForStores()!;
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, {
      adminUserId: "admin-1",
      productKind: "banner",
      campaignId: "c1",
      expectedLifecycle: "DRAFT",
      expectedUpdatedAt: UPDATED,
      reason: "잘못 만든 초안",
    });
    expect(res).toMatchObject({ ok: false, error: "rpc_missing", httpStatus: 503 });
    expect(tableDeletes).toEqual([]);
  });

  it("함수: DB 가 이력 있음 → delete_not_allowed 422", async () => {
    campaignRow = { id: "c1", lifecycle_status: "DRAFT", updated_at: UPDATED, campaign_source: "DIBAY_FIRST_PARTY" };
    rpc.mockResolvedValue({ data: { ok: false, error: "delete_not_allowed" }, error: null });
    const sb = (await import("@/lib/stores/try-supabase-stores")).tryGetSupabaseForStores()!;
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, {
      adminUserId: "admin-1",
      productKind: "banner",
      campaignId: "c1",
      expectedLifecycle: "DRAFT",
      expectedUpdatedAt: UPDATED,
      reason: "잘못 만든 초안",
    });
    expect(res).toMatchObject({ ok: false, error: "delete_not_allowed", httpStatus: 422 });
  });
});
