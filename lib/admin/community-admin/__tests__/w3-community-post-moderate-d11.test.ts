/**
 * D-11 (2026-11-07) — 진행 중 상위노출이 걸린 글 숨김·삭제 = DB 함수 `admin_community_post_moderate` 1번
 * (주문 종료 + 글 상태 변경 한 트랜잭션).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const appendCommunityAdminAudit = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...a: unknown[]) => (appendCommunityAdminAudit as (...x: unknown[]) => unknown)(...a),
}));
const notifyCommunityPromotionEnded = vi.fn(async () => undefined);
vi.mock("@/lib/notifications/notify-community-moderation", () => ({
  notifyCommunityPromotionEnded: (...a: unknown[]) => (notifyCommunityPromotionEnded as (...x: unknown[]) => unknown)(...a),
  notifyCommunityContentModerated: vi.fn(async () => undefined),
}));
vi.mock("@/lib/points/community-point-bridge", () => ({
  applyCommunityPointReclaimOnPostAdminRemove: vi.fn(async () => undefined),
}));
const runCommunityPromotionOrderAction = vi.fn();
vi.mock("@/lib/admin/community-admin/community-promotion-order-action", () => ({
  runCommunityPromotionOrderAction: (...a: unknown[]) => runCommunityPromotionOrderAction(...a),
}));

const UPDATED = "2026-11-01T00:00:00.000000+00:00";
let post: Record<string, unknown>;
let orders: Array<Record<string, unknown>>;
const rpc = vi.fn();
const postUpdates: Array<Record<string, unknown>> = [];

function makeSb() {
  return {
    rpc: (...a: unknown[]) => rpc(...a),
    from(table: string) {
      let mode: "select" | "update" = "select";
      let row: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        is: () => q,
        update: (r: Record<string, unknown>) => {
          mode = "update";
          row = r;
          if (table === "community_posts") postUpdates.push(r);
          return q;
        },
        maybeSingle: async () => {
          if (table === "community_posts") return { data: mode === "update" ? { ...post, ...row } : post, error: null };
          return { data: null, error: null };
        },
        then(res: (v: unknown) => void) {
          if (table === "point_promotion_orders") return res({ data: orders, error: null });
          return res({ data: null, error: null });
        },
      };
      return q;
    },
  };
}

import { applyCommunityPostAdminPatch } from "@/lib/admin/community-admin/community-post-admin-patch";

beforeEach(() => {
  vi.clearAllMocks();
  postUpdates.length = 0;
  post = { id: "p1", user_id: "u1", origin_kind: "member", status: "active", updated_at: UPDATED, title: "글" };
  orders = [{ id: "o1", user_id: "buyer-1", order_status: "active", end_at: "2026-11-10T00:00:00Z" }];
  rpc.mockResolvedValue({
    data: { ok: true, ended_orders: [{ order_id: "o1", user_id: "buyer-1", refund_points: 300 }], refund_points: 300 },
    error: null,
  });
});

describe("D-11 ① 글 숨김·삭제 + 진행 중 상위노출", () => {
  it("귀책 없으면 400 promotion_fault_required · 아무것도 바꾸지 않음", async () => {
    const out = await applyCommunityPostAdminPatch(makeSb() as never, null, {
      actorId: "admin-1",
      postId: "p1",
      body: { expectedUpdatedAt: UPDATED, status: "hidden", reason: "광고성 글" },
    });
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("promotion_fault_required");
    expect(rpc).not.toHaveBeenCalled();
    expect(postUpdates).toHaveLength(0);
  });

  it("귀책 있음 → DB 함수 1번(hide·operator) · 주문 종료 단계 경로·글 CAS 직접 UPDATE 없음 · 구매자 알림", async () => {
    const out = await applyCommunityPostAdminPatch(makeSb() as never, null, {
      actorId: "admin-1",
      postId: "p1",
      body: { expectedUpdatedAt: UPDATED, status: "hidden", reason: "광고성 글", promotionFault: "operator" },
    });
    expect(out.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_community_post_moderate", {
      p_post: "p1",
      p_admin: "admin-1",
      p_action: "hide",
      p_fault: "operator",
      p_reason: "광고성 글",
      p_expected_updated_at: UPDATED,
    });
    expect(runCommunityPromotionOrderAction).not.toHaveBeenCalled();
    expect(postUpdates.some((u) => u.status === "hidden")).toBe(false);
    expect(notifyCommunityPromotionEnded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: "o1", userId: "buyer-1", refundPoints: 300 })
    );
  });

  it("DB 함수 실패 → 오류 그대로 · 주문 종료만 남는 경로 없음", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "promotion_end_failed" }, error: null });
    const out = await applyCommunityPostAdminPatch(makeSb() as never, null, {
      actorId: "admin-1",
      postId: "p1",
      body: { expectedUpdatedAt: UPDATED, status: "deleted", reason: "광고성 글", promotionFault: "member" },
    });
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("promotion_end_failed");
    expect(runCommunityPromotionOrderAction).not.toHaveBeenCalled();
    expect(postUpdates).toHaveLength(0);
    expect(notifyCommunityPromotionEnded).not.toHaveBeenCalled();
  });

  it("DB 함수 없음 → 503 rpc_missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const out = await applyCommunityPostAdminPatch(makeSb() as never, null, {
      actorId: "admin-1",
      postId: "p1",
      body: { expectedUpdatedAt: UPDATED, status: "hidden", reason: "광고성 글", promotionFault: "operator" },
    });
    expect(out.status).toBe(503);
    expect(out.body.error).toBe("rpc_missing");
  });

  it("상위노출 없는 글 숨김 → 기존 CAS UPDATE (DB 함수 안 씀)", async () => {
    orders = [];
    const out = await applyCommunityPostAdminPatch(makeSb() as never, null, {
      actorId: "admin-1",
      postId: "p1",
      body: { expectedUpdatedAt: UPDATED, status: "hidden", reason: "광고성 글" },
    });
    expect(out.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(postUpdates.some((u) => u.status === "hidden")).toBe(true);
  });
});
