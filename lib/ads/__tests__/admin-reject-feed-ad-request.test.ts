import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAdminRouteAudit = vi.fn();
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));

import { adminRejectFeedAdRequest } from "@/lib/ads/admin-reject-feed-ad-request";

const rpc = vi.fn();
const from = vi.fn();
const sb = { rpc, from } as never;
const req = new Request("https://x.test/");

beforeEach(() => vi.clearAllMocks());

describe("H-2 adminRejectFeedAdRequest — 단일 반려 구현", () => {
  it("RPC 한 번 + before/after 감사, 테이블 직접 쓰기 없음", async () => {
    rpc.mockResolvedValue({ data: { ok: true, previous_status: "pending_review", released_points: 300 }, error: null });
    const out = await adminRejectFeedAdRequest(sb, req, { requestId: "req-1", reason: "  부적절  ", actorId: "admin-1" });
    expect(out).toEqual({ ok: true, status: "rejected", previousStatus: "pending_review", releasedPoints: 300 });
    expect(rpc).toHaveBeenCalledWith("admin_reject_feed_ad_request", {
      p_request_id: "req-1",
      p_reason: "부적절",
      p_actor: "admin-1",
    });
    expect(from).not.toHaveBeenCalled();
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(sb, req, {
      actorId: "admin-1",
      targetType: "feed_ad_request",
      targetId: "req-1",
      action: "feed_ad_request.reject",
      before: { status: "pending_review" },
      after: { status: "rejected", reason: "부적절", released_points: 300 },
    });
  });

  it("빈 사유는 RPC 없이 reason_required", async () => {
    const out = await adminRejectFeedAdRequest(sb, req, { requestId: "req-1", reason: " ", actorId: "admin-1" });
    expect(out).toEqual({ ok: false, error: "reason_required", httpStatus: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["not_pending", 409],
    ["not_found", 404],
    ["invalid_args", 400],
    ["forbidden", 500],
  ])("RPC 오류 %s → %i, 감사 없음", async (error, httpStatus) => {
    rpc.mockResolvedValue({ data: { ok: false, error }, error: null });
    const out = await adminRejectFeedAdRequest(sb, req, { requestId: "req-1", reason: "사유", actorId: "admin-1" });
    expect(out).toEqual({ ok: false, error, httpStatus });
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });
});
