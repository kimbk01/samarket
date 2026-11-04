/**
 * 「조치 × 화면」 표 시험 (설계 §6 · 보완 §4-4 · 2026-11-04) — 같은 조치는 공통 광고 화면(허브)·도메인 화면에서
 * 같은 단계 · 같은 감사 이름 · before/after 가 있다. 라우트를 실제로 실행한다(DB·F 래퍼만 모킹).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUser = vi.fn();
const requireAdminPermission = vi.fn();
const appendAdminRouteAudit = vi.fn();
const persistAdvertisingAdminMemo = vi.fn();
const adminPauseFeedAd = vi.fn();
const adminResumeFeedAd = vi.fn();
const adminEndFeedAd = vi.fn();
const approveFeedAdRequest = vi.fn();
const adminCompensateExtendFeedAdCampaign = vi.fn();
const adminDeleteDeliveryAdDraftGuarded = vi.fn();
const adminEndDeliveryAdWithRefund = vi.fn();
const adminTransitionDeliveryAdCampaign = vi.fn();
const updatePlatformPopupAdminCampaign = vi.fn();

/** 표 이름별 maybeSingle 응답 */
let tables: Record<string, Record<string, unknown> | null> = {};

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/ads/advertising-admin-memo", () => ({
  persistAdvertisingAdminMemo: (...a: unknown[]) => persistAdvertisingAdminMemo(...a),
}));
vi.mock("@/lib/ads/admin-feed-ad-lifecycle", () => ({
  adminPauseFeedAd: (...a: unknown[]) => adminPauseFeedAd(...a),
  adminResumeFeedAd: (...a: unknown[]) => adminResumeFeedAd(...a),
  adminEndFeedAd: (...a: unknown[]) => adminEndFeedAd(...a),
}));
vi.mock("@/lib/ads/approve-feed-ad-request", () => ({
  approveFeedAdRequest: (...a: unknown[]) => approveFeedAdRequest(...a),
}));
vi.mock("@/lib/ads/admin-compensate-extend-feed-ad-campaign", () => ({
  adminCompensateExtendFeedAdCampaign: (...a: unknown[]) => adminCompensateExtendFeedAdCampaign(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-delete", () => ({
  adminDeleteDeliveryAdDraftGuarded: (...a: unknown[]) => adminDeleteDeliveryAdDraftGuarded(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-end", async (orig) => ({
  ...((await orig()) as object),
  adminEndDeliveryAdWithRefund: (...a: unknown[]) => adminEndDeliveryAdWithRefund(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", () => ({
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
}));
vi.mock("@/lib/platform-popup/admin-campaign-writer", () => ({
  updatePlatformPopupAdminCampaign: (...a: unknown[]) => updatePlatformPopupAdminCampaign(...a),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      };
      return q;
    },
    rpc: vi.fn(),
  }),
}));

import { POST as hubPOST } from "@/app/api/admin/advertising-workspace/action/route";
import { PATCH as domainPATCH } from "@/app/api/admin/feed-ad-requests/[id]/route";
import { adsWorkspaceMutationConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  isListingPausedBoost,
  isWorkspacePopupDeleteSafeDraft,
  listWorkspaceDrawerActions,
  type WorkspaceEntityFamily,
} from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { isPlatformPopupDeleteSafeDraftRow } from "@/lib/platform-popup/admin-campaign-delete-draft";

function hub(body: Record<string, unknown>) {
  return hubPOST(
    new Request("https://x.test/api/admin/advertising-workspace/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}
function domain(id: string, body: Record<string, unknown>) {
  return domainPATCH(
    new Request(`https://x.test/api/admin/feed-ad-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) }
  );
}

const CAMPAIGN_BEFORE = {
  id: "camp-1",
  status: "active",
  start_at: "2026-11-01T00:00:00Z",
  end_at: "2026-11-08T00:00:00Z",
  source: "MEMBER_REQUESTED",
  request_id: "req-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
  requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-1" }, sb: {} });
  persistAdvertisingAdminMemo.mockResolvedValue({ ok: true });
  tables = {
    feed_ad_requests: { id: "req-1", status: "active", campaign_id: "camp-1" },
    feed_ad_campaigns: CAMPAIGN_BEFORE,
  };
  adminPauseFeedAd.mockResolvedValue({ ok: true, status: "paused" });
  adminResumeFeedAd.mockResolvedValue({ ok: true, status: "active", extended_seconds: 7200 });
  adminEndFeedAd.mockResolvedValue({ ok: true, preview: false, refund_points: 150, paid_points: 300, remaining_seconds: 100 });
  approveFeedAdRequest.mockResolvedValue({ ok: true, status: "active", campaignId: "camp-1" });
  adminCompensateExtendFeedAdCampaign.mockResolvedValue({
    ok: true,
    previousEndAt: "2026-11-08T00:00:00Z",
    newEndAt: "2026-11-10T00:00:00Z",
    daysAdded: 2,
    extensionKind: "ADMIN_FREE_COMPENSATION",
  });
});

type Row = { action: "approve" | "pause" | "resume" | "end" | "extend_compensation"; audit: string; level: string };
const MATRIX: Row[] = [
  { action: "approve", audit: "feed_ad_request.approve", level: "L2" },
  { action: "pause", audit: "feed_ad_request.pause", level: "L2" },
  { action: "resume", audit: "feed_ad_request.resume", level: "L2" },
  { action: "end", audit: "feed_ad_request.end", level: "L3" },
  { action: "extend_compensation", audit: "feed_ad_request.extend_compensation", level: "L2" },
];

function lastAudit() {
  const calls = appendAdminRouteAudit.mock.calls;
  return calls[calls.length - 1]![2] as {
    action: string;
    targetType: string;
    targetId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
  };
}

describe("조치 × 화면 — 피드 배너 (허브 ↔ 도메인 같은 단계·감사 이름·before/after)", () => {
  it.each(MATRIX)("$action: 두 화면 같은 감사 이름 $audit · before/after · 화면 표시", async (row) => {
    const body = {
      reason: "운영 확인 사유",
      internalReason: "내부 메모",
      fault: "operator",
      requestedDays: 2,
    };
    if (row.action === "approve") tables.feed_ad_requests = { id: "req-1", status: "pending_review", campaign_id: null };

    const h = await hub({ family: "feed_banner", entityId: "req-1", action: row.action, ...body });
    expect(h.status).toBe(200);
    const hubAudit = lastAudit();

    if (row.action === "approve") tables.feed_ad_requests = { id: "req-1", status: "pending_review", campaign_id: null };
    const d = await domain("req-1", { action: row.action, ...body });
    expect(d.status).toBe(200);
    const domainAudit = lastAudit();

    expect(appendAdminRouteAudit).toHaveBeenCalledTimes(2);
    for (const [a, screen] of [
      [hubAudit, "hub"],
      [domainAudit, "domain"],
    ] as const) {
      expect(a.action).toBe(row.audit);
      expect(a.targetType).toBe("feed_ad_request");
      expect(a.targetId).toBe("req-1");
      expect(a.before && Object.keys(a.before).length).toBeTruthy();
      expect(a.after).toMatchObject({
        reason_public: "운영 확인 사유",
        reason_internal: "내부 메모",
        screen,
      });
    }
    if (row.action === "end") {
      expect(hubAudit.after).toMatchObject({ fault: "operator", refund_amount: 150 });
      expect(domainAudit.after).toMatchObject({ fault: "operator", refund_amount: 150 });
    }
    // 같은 동작 단계 표 (공통 화면 copy = 도메인 상세 copy)
    expect(adsWorkspaceMutationConfirmCopy(row.action, true, { family: "feed_banner" }).level).toBe(row.level);
  });

  it.each(["pause", "resume", "end", "extend_compensation", "approve"] as const)(
    "%s: 사유 없으면 두 화면 모두 400 reason_required · 쓰기·감사 0 (FB-A05)",
    async (action) => {
      const h = await hub({ family: "feed_banner", entityId: "req-1", action, fault: "operator" });
      const d = await domain("req-1", { action, fault: "operator" });
      for (const res of [h, d]) {
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe("reason_required");
      }
      expect(adminPauseFeedAd).not.toHaveBeenCalled();
      expect(adminResumeFeedAd).not.toHaveBeenCalled();
      expect(adminEndFeedAd).not.toHaveBeenCalled();
      expect(appendAdminRouteAudit).not.toHaveBeenCalled();
    }
  );

  it("D-5: 정지·재개·종료는 F 의 DB 함수 래퍼에 공개 사유·내부 메모를 그대로 넘긴다 (빈 사유를 코드값으로 바꾸지 않음)", async () => {
    await hub({ family: "feed_banner", entityId: "req-1", action: "pause", reason: "신고 확인", internalReason: "메모" });
    expect(adminPauseFeedAd).toHaveBeenCalledWith(expect.anything(), {
      campaignId: "camp-1",
      adminUserId: "admin-1",
      publicReason: "신고 확인",
      internalReason: "메모",
    });
  });

  it("D-5: 종료 미리보기는 사유 없이 되고 감사를 남기지 않는다", async () => {
    adminEndFeedAd.mockResolvedValue({ ok: true, preview: true, refund_points: 90, paid_points: 300, remaining_seconds: 10 });
    const res = await domain("req-1", { action: "end", preview: true, fault: "operator" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, preview: { refundPoints: 90, paidPoints: 300 } });
    expect(adminEndFeedAd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ preview: true, fault: "operator" }));
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("D-6: 공개 사유는 120자로 자른다", async () => {
    await hub({ family: "feed_banner", entityId: "req-1", action: "pause", reason: "가".repeat(200) });
    expect((adminPauseFeedAd.mock.calls[0]![1] as { publicReason: string }).publicReason).toHaveLength(120);
  });
});

describe("AL-09 · AL-10 — 신청 없는 운영자 등록 캠페인", () => {
  beforeEach(() => {
    tables.feed_ad_requests = null;
    tables.feed_ad_campaigns = { ...CAMPAIGN_BEFORE, id: "camp-9", source: "ADMIN_DIRECT", request_id: null };
  });

  it("AL-09: 연장은 캠페인 id 를 넘긴다 (예전: 신청 id 로 넘겨 항상 400)", async () => {
    const res = await hub({ family: "feed_banner", entityId: "camp-9", action: "extend_compensation", reason: "점검 보상", requestedDays: 2 });
    expect(res.status).toBe(200);
    expect(adminCompensateExtendFeedAdCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ campaignId: "camp-9", requestId: null, requestedDays: 2 })
    );
  });

  it("AL-10: 감사 대상 유형 = feed_ad_campaign (캠페인 id) · 감사 이름은 같다", async () => {
    await hub({ family: "feed_banner", entityId: "camp-9", action: "pause", reason: "점검" });
    expect(lastAudit()).toMatchObject({
      action: "feed_ad_request.pause",
      targetType: "feed_ad_campaign",
      targetId: "camp-9",
    });
  });
});

describe("동작 단계 표 — 같은 동작은 모든 광고 계열·화면에서 같은 단계 (§6)", () => {
  const families: WorkspaceEntityFamily[] = [
    "boost_community",
    "boost_trade",
    "feed_banner",
    "delivery_banner",
    "delivery_sponsored",
    "platform_popup_campaign",
  ];
  it.each([
    ["pause", "pause", "L2"],
    ["resume", "adResume", "L2"],
    ["end", "end", "L3"],
    ["extend_compensation", "extend", "L2"],
    ["delete_safe_draft", "delete", "L3"],
  ] as const)("%s = %s(%s) — 공통 화면 copy 와 도메인 상세가 쓰는 종류가 같다", (action, kind, level) => {
    expect(adminActionLevel(kind)).toBe(level);
    for (const f of families) {
      expect(adsWorkspaceMutationConfirmCopy(action, true, { family: f }).level).toBe(level);
    }
  });

  it("D-6: 정지·재개·종료·연장은 공개 사유 + 내부 메모 두 칸", () => {
    for (const a of ["pause", "resume", "end", "extend_compensation"] as const) {
      expect(adsWorkspaceMutationConfirmCopy(a, true).splitReason).toBe(true);
    }
    expect(adsWorkspaceMutationConfirmCopy("approve", true).splitReason).toBe(false);
  });

  it("AL-18: 종료 확인창에 영어 「lifecycle」이 없다", () => {
    const c = adsWorkspaceMutationConfirmCopy("end", true);
    expect(`${c.title}${c.body}`).not.toMatch(/lifecycle/i);
  });
});

describe("삭제 규칙 (§4-3 · AL-01 · AL-16)", () => {
  it("AL-01: 공통 화면 배달 초안 삭제 = 도메인과 같은 막는 함수 · 함수가 정한 상태 코드 그대로", async () => {
    adminDeleteDeliveryAdDraftGuarded.mockResolvedValue({ ok: false, error: "delete_not_allowed", httpStatus: 409 });
    tables.store_banner_ad_campaigns = { id: "d-1" };
    tables.delivery_banner_ad_campaigns = { id: "d-1" };
    const res = await hub({
      family: "delivery_banner",
      entityId: "d-1",
      action: "delete_safe_draft",
      reason: "중복 초안",
      expectedLifecycle: "DRAFT",
      expectedUpdatedAt: "2026-11-01T00:00:00Z",
    });
    // 표 이름은 실제 상수를 따른다 — 행이 없으면 404 이므로 둘 중 하나는 맞아야 한다
    if (res.status === 404) return expect.fail("campaign table mock did not match");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("delete_not_allowed");
    expect(adminDeleteDeliveryAdDraftGuarded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ campaignId: "d-1", productKind: "banner", reason: "중복 초안" })
    );
  });

  it("AL-16: 공통 화면 팝업 초안 판정 = 서버 isPlatformPopupDeleteSafeDraftRow 와 같은 결과", () => {
    const cases = [
      { server: { status: "draft", owner_store_id: null, owner_request_id: null }, item: { sourceKind: "admin_direct", completenessClass: "draft_ready" } },
      { server: { status: "pending_review", owner_store_id: null, owner_request_id: null }, item: { sourceKind: "admin_direct", completenessClass: "pending_review" } },
      { server: { status: "draft", owner_store_id: "s-1", owner_request_id: null }, item: { sourceKind: "owner", completenessClass: "draft_ready" } },
      { server: { status: "active", owner_store_id: null, owner_request_id: null }, item: { sourceKind: "admin_direct", completenessClass: "operating", runtimeDisplayStatus: "live_now" } },
    ];
    for (const c of cases) {
      expect(isWorkspacePopupDeleteSafeDraft(c.item)).toBe(isPlatformPopupDeleteSafeDraftRow(c.server));
    }
    // 검토 대기 운영자 팝업은 공통 화면에도 삭제가 보이고, 사장님 연결 초안은 숨는다
    expect(
      listWorkspaceDrawerActions({ family: "platform_popup_campaign", statusRaw: "검토 대기", popupDeleteSafe: true })
    ).toContain("delete_safe_draft");
    expect(
      listWorkspaceDrawerActions({ family: "platform_popup_campaign", statusRaw: "임시저장", popupDeleteSafe: false })
    ).not.toContain("delete_safe_draft");
  });
});

describe("AL-17 — 글 상태로 멈춘 거래 주문은 공통 화면도 재개를 숨긴다", () => {
  it("paused_by = listing_* → 재개 없음 · admin → 재개 있음", () => {
    expect(isListingPausedBoost("listing_owner_hidden")).toBe(true);
    expect(listWorkspaceDrawerActions({ family: "boost_trade", statusRaw: "paused", pausedBy: "listing_owner_hidden" })).not.toContain("resume");
    expect(listWorkspaceDrawerActions({ family: "boost_trade", statusRaw: "paused", pausedBy: "admin" })).toContain("resume");
  });
});

describe("AL-07 · E-2 — 운영자 팝업 기간만 바꾸면 재검토로 되돌리지 않는다", () => {
  it("사장님 신청 연결 없음 → 바뀐 소재 목록 비움 · 응답에 revertedToReview", async () => {
    tables.platform_popup_campaigns = { id: "p-1", owner_request_id: null };
    updatePlatformPopupAdminCampaign.mockResolvedValue({ ok: true, id: "p-1", revertedToReview: false });
    const res = await hub({
      family: "platform_popup_campaign",
      entityId: "p-1",
      action: "change_period",
      startAt: "2026-11-05T00:00:00Z",
      endAt: "2026-11-09T00:00:00Z",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, revertedToReview: false });
    expect(updatePlatformPopupAdminCampaign).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ materialTouched: [] }));
  });

  it("사장님 신청 연결 팝업 → 기간 = 재검토 그대로, revertedToReview true 를 화면에 알린다", async () => {
    tables.platform_popup_campaigns = { id: "p-2", owner_request_id: "or-1" };
    updatePlatformPopupAdminCampaign.mockResolvedValue({ ok: true, id: "p-2", revertedToReview: true });
    const res = await hub({
      family: "platform_popup_campaign",
      entityId: "p-2",
      action: "change_period",
      startAt: "2026-11-05T00:00:00Z",
      endAt: "2026-11-09T00:00:00Z",
    });
    expect(await res.json()).toMatchObject({ revertedToReview: true });
    expect(updatePlatformPopupAdminCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ materialTouched: ["schedule"] })
    );
  });
});

describe("AL-19 — 공통 서버는 배달 원문 오류를 응답에 싣지 않는다", () => {
  it("writer 가 DB 원문을 돌려줘도 고정 코드만", async () => {
    tables.store_banner_ad_campaigns = { id: "d-1" };
    tables.delivery_banner_ad_campaigns = { id: "d-1" };
    adminTransitionDeliveryAdCampaign.mockResolvedValue({
      ok: false,
      error: "duplicate key value violates unique constraint",
      detail: "relation xyz",
    });
    const res = await hub({
      family: "delivery_banner",
      entityId: "d-1",
      action: "approve",
      reason: "검토 완료",
      expectedLifecycle: "PENDING_REVIEW",
      expectedUpdatedAt: "2026-11-01T00:00:00Z",
    });
    if (res.status === 404) return expect.fail("campaign table mock did not match");
    const j = (await res.json()) as { error: string; detail: unknown };
    expect(j.error).toBe("save_failed");
    expect(JSON.stringify(j)).not.toMatch(/duplicate key|relation xyz/);
  });
});
