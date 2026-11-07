import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUser = vi.fn();
const requireAdminPermission = vi.fn();
const requireCommunityAdmin = vi.fn();
const adminRejectFeedAdRequest = vi.fn();
const runCommunityPromotionOrderAction = vi.fn();
const persistAdvertisingAdminMemo = vi.fn();
const from = vi.fn();
const rpc = vi.fn();
const appendAdminRouteAudit = vi.fn();
const adminPauseFeedAd = vi.fn();
const adminResumeFeedAd = vi.fn();
const adminEndFeedAd = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: (...a: unknown[]) => requireCommunityAdmin(...a),
}));
vi.mock("@/lib/ads/admin-reject-feed-ad-request", () => ({
  adminRejectFeedAdRequest: (...a: unknown[]) => adminRejectFeedAdRequest(...a),
}));
vi.mock("@/lib/admin/community-admin/community-promotion-order-action", () => ({
  runCommunityPromotionOrderAction: (...a: unknown[]) => runCommunityPromotionOrderAction(...a),
}));
vi.mock("@/lib/ads/advertising-admin-memo", () => ({
  persistAdvertisingAdminMemo: (...a: unknown[]) => persistAdvertisingAdminMemo(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
// D-5: 허브 피드 정지·재개·종료 = 담당 F 의 DB 함수 래퍼 (도메인 화면과 같은 runFeedAdAdminAction)
vi.mock("@/lib/ads/admin-feed-ad-lifecycle", () => ({
  adminPauseFeedAd: (...a: unknown[]) => adminPauseFeedAd(...a),
  adminResumeFeedAd: (...a: unknown[]) => adminResumeFeedAd(...a),
  adminEndFeedAd: (...a: unknown[]) => adminEndFeedAd(...a),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from, rpc }),
}));

import { POST } from "@/app/api/admin/advertising-workspace/action/route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("https://x.test/api/admin/advertising-workspace/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
  requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-1" }, sb: {} });
  requireCommunityAdmin.mockResolvedValue({ ok: true, userId: "admin-1", sb: {} });
  persistAdvertisingAdminMemo.mockResolvedValue({ ok: true });
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: { id: "req-1", campaign_id: "camp-1", status: "active" }, error: null }),
  };
  from.mockReturnValue(q);
});

describe("H-2 — 허브 피드 광고 반려 = 도메인과 같은 단일 구현", () => {
  it("calls adminRejectFeedAdRequest (DB 함수 한 트랜잭션 + 같은 감사), 테이블 직접 update·별도 환급 없음", async () => {
    adminRejectFeedAdRequest.mockResolvedValue({ ok: true, status: "rejected", previousStatus: "pending_review", releasedPoints: 300 });
    const res = await call({ family: "feed_banner", entityId: "req-1", action: "reject", reason: "부적절한 이미지" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "rejected" });
    expect(adminRejectFeedAdRequest).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      requestId: "req-1",
      reason: "부적절한 이미지",
      actorId: "admin-1",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the shared function's error/status (not_pending → 409) without memo", async () => {
    adminRejectFeedAdRequest.mockResolvedValue({ ok: false, error: "not_pending", httpStatus: 409 });
    const res = await call({ family: "feed_banner", entityId: "req-1", action: "reject", reason: "부적절한 이미지" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_pending");
    expect(persistAdvertisingAdminMemo).not.toHaveBeenCalled();
  });
});

describe("H-3 — 허브 커뮤니티 상위노출 조치 = 도메인과 같은 단일 구현", () => {
  it("resume passes the reason to runCommunityPromotionOrderAction after the community gate", async () => {
    runCommunityPromotionOrderAction.mockResolvedValue({ ok: true, body: { ok: true, orderStatus: "active", endAt: "x" } });
    const res = await call({ family: "boost_community", entityId: "ord-1", action: "resume", reason: "확인 완료" });
    expect(res.status).toBe(200);
    expect(requireCommunityAdmin).toHaveBeenCalledWith("promotion");
    expect(runCommunityPromotionOrderAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ orderId: "ord-1", actorId: "admin-1", action: "resume", reason: "확인 완료" })
    );
  });

  it("resume without a reason → 400 reason_required from the shared rule", async () => {
    runCommunityPromotionOrderAction.mockResolvedValue({ ok: false, error: "reason_required", httpStatus: 400 });
    const res = await call({ family: "boost_community", entityId: "ord-1", action: "resume" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
  });

  it("community gate denial stops before the action", async () => {
    requireCommunityAdmin.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });
    const res = await call({ family: "boost_community", entityId: "ord-1", action: "resume", reason: "확인 완료" });
    expect(res.status).toBe(403);
    expect(runCommunityPromotionOrderAction).not.toHaveBeenCalled();
  });
});

describe("재감사 N-04 · FB-A06 → D-14 (2026-11-07) — 허브 피드 배너 정지·재개·종료 감사는 DB 함수 1행만", () => {
  it.each([
    ["pause", adminPauseFeedAd],
    ["resume", adminResumeFeedAd],
    ["end", adminEndFeedAd],
  ] as const)("%s → TS 감사 0 · DB 래퍼에 screen=hub 전달", async (action, writer) => {
    writer.mockResolvedValue({ ok: true, status: action === "end" ? "ended" : action === "pause" ? "paused" : "active" });
    const res = await call({ family: "feed_banner", entityId: "req-1", action, reason: "운영 확인", fault: "none" });
    expect(res.status).toBe(200);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer.mock.calls[0]![1]).toMatchObject({ campaignId: "camp-1", publicReason: "운영 확인", screen: "hub" });
  });
  it("writer 가 실패하면 감사를 남기지 않는다", async () => {
    adminPauseFeedAd.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await call({ family: "feed_banner", entityId: "req-1", action: "pause", reason: "운영 확인" });
    expect(res.status).toBe(404);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });
});
