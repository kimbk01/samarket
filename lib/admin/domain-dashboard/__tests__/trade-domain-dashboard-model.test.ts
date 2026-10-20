import { describe, expect, it } from "vitest";
import { buildTradeDomainDashboardModel } from "@/lib/admin/domain-dashboard/load-trade-domain-dashboard";
import type { TradeOverview } from "@/lib/admin/trade-admin/trade-metrics";
import { TRADE_POST_TABS } from "@/lib/admin/trade-admin/trade-post-tabs";

function overview(over: Partial<TradeOverview> = {}): TradeOverview {
  return {
    period: { fromIso: "2026-10-13T16:00:00.000Z", toIso: "2026-10-20T16:00:00.000Z", fromDate: "2026-10-14", toDate: "2026-10-20" },
    pending: { openReports: 2, promotionReview: 0, openSupport: null, activeRestrictions: 1, overduePromotions: 3 },
    current: {
      ...(Object.fromEntries(TRADE_POST_TABS.map((t, i) => [t, i * 10])) as Record<(typeof TRADE_POST_TABS)[number], number>),
      activePromotions: 4,
    },
    inPeriod: {
      newPosts: 5,
      completed: 2,
      adminCompletedNoTime: 0,
      reportsReceived: 1,
      reportsProcessed: 1,
      chatsStarted: 7,
      promotionsStarted: null,
      promotionsEnded: null,
      promotionPointsUsed: null,
      promotionPointsRefunded: null,
      supportReceived: 0,
      adminActions: 0,
    },
    byCategory: null,
    byRegion: null,
    recentActions: null,
    errors: ["x:y"],
    ...over,
  };
}

describe("거래 도메인 공통 모델 (V3-17)", () => {
  it("TradeOverview → AdminDomainDashboardModel: 구역·id·href·null 유지", () => {
    const m = buildTradeDomainDashboardModel(overview(), { periodKind: "7d" });
    expect(m.domain).toBe("trade");
    // 처리 대기: 0 은 숨기고, 확인 불가(null)는 남긴다
    expect(m.actionRequired.map((a) => [a.id, a.count])).toEqual([
      ["trade.reports_open", 2],
      ["trade.support_open", null],
    ]);
    expect(m.actionRequired[0].href).toBe("/admin/trade/reports?tab=open");
    expect(m.issues.map((i) => i.id)).toEqual(["trade.promotions_overdue"]);
    const selling = m.currentState.find((s) => s.id === "trade.posts.selling");
    expect(selling).toMatchObject({ value: 20, href: "/admin/posts-management?tab=selling" });
    expect(m.currentState.find((s) => s.id === "trade.promotions_active")?.value).toBe(4);
    expect(m.periodStats?.find((s) => s.id === "trade.period.chats_started")?.value).toBe(7);
    expect(m.periodRange).toEqual({ period: "7d", from: "2026-10-14", to: "2026-10-20", timezone: "Asia/Manila" });
    expect(m.sectionErrors).toEqual(["x:y"]);
    // metricValues = 모든 지표 (0 포함) — 통합 대시보드가 같은 id 로 읽는다
    const mv = new Map(m.metricValues?.map((v) => [v.id, v]));
    expect(mv.get("trade.promotion_review")).toMatchObject({ value: 0, section: "action", forbidden: false });
    expect(mv.get("trade.posts.sold")?.value).toBe(40);
    expect(new Set(m.metricValues?.map((v) => v.id)).size).toBe(m.metricValues?.length);
  });
});
