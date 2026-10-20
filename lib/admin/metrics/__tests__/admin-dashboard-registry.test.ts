import { describe, expect, it } from "vitest";
import { ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY } from "@/lib/admin/admin-action-queue-registry";
import { CHAT_METRIC_BY_ID } from "@/lib/admin/metrics/chat-metrics";
import { COMMUNITY_METRIC_DEFINITIONS } from "@/lib/admin/metrics/community-metrics";
import { DELIVERY_METRIC_DEFINITIONS } from "@/lib/admin/metrics/delivery-metrics";
import { TRADE_METRIC_BY_ID } from "@/lib/admin/metrics/trade-domain-metrics";
import {
  ADMIN_DASHBOARD_BAND,
  ADMIN_DASHBOARD_DOMAIN_CARDS,
  ADMIN_DASHBOARD_OMITTED_METRICS,
  ADMIN_DASHBOARD_TAB_IDS,
  ADMIN_DASHBOARD_TABS,
  ADMIN_DASHBOARD_TRENDS,
  ADMIN_METRIC_BY_ID,
  ADMIN_METRIC_DEFINITIONS,
  parseAdminDashboardTab,
  resolveAdminMetricHref,
} from "@/lib/admin/metrics/registry";
import {
  parseAdminDashboardParts,
  parseAdminDashboardRange,
} from "@/lib/admin/metrics/dashboard-overview-contract";
import { resolveAdminRouteAccess } from "@/lib/admin/access/admin-route-access";

const HREF = { todayPht: "2026-10-20" };

describe("Admin Metric Registry (설계 v4 §3 · 통합 §2.5)", () => {
  it("지표 id 는 유일하고, 모두 PHT 기준이며, href 는 /admin 안이다", () => {
    const ids = ADMIN_METRIC_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ADMIN_METRIC_DEFINITIONS) {
      expect(d.periodBasis).toBe("pht");
      const href = resolveAdminMetricHref(d, HREF);
      expect(href.startsWith("/admin"), `${d.id} → ${href}`).toBe(true);
      expect(href).not.toMatch(/^\/admin\/_/);
      expect(d.labelKo.trim()).not.toBe("");
      expect(d.labelEn.trim()).not.toBe("");
      expect(d.sourceDetail.trim()).not.toBe("");
    }
  });

  it("오늘 가입 링크 = PHT 오늘 날짜 필터", () => {
    expect(resolveAdminMetricHref(ADMIN_METRIC_BY_ID.get("members.new_today")!, HREF)).toBe(
      "/admin/users?joinedFrom=2026-10-20&joinedTo=2026-10-20"
    );
  });

  it("처리 대기 합산 지표의 카테고리는 레지스트리에 있다", () => {
    for (const d of ADMIN_METRIC_DEFINITIONS) {
      if (!d.queueCategories) continue;
      expect(d.source).toBe("queue");
      expect(d.queueCategories.length).toBeGreaterThan(0);
      for (const c of d.queueCategories) expect(ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.has(c)).toBe(true);
    }
  });

  it("도메인 지표는 도메인 정의와 같은 id·같은 href (전체 vs 도메인 값 일치)", () => {
    const delivery = new Map(DELIVERY_METRIC_DEFINITIONS.map((d) => [d.id as string, d]));
    const community = new Map(COMMUNITY_METRIC_DEFINITIONS.map((d) => [d.id, d]));
    for (const d of ADMIN_METRIC_DEFINITIONS) {
      if (d.source === "delivery") expect(delivery.get(d.id)?.href, d.id).toBe(d.href);
      if (d.source === "chat") expect((CHAT_METRIC_BY_ID as ReadonlyMap<string, { href: string }>).get(d.id)?.href, d.id).toBe(d.href);
      if (d.source === "community") expect(community.get(d.id)?.href, d.id).toBe(d.href);
      if (d.source === "trade") expect(TRADE_METRIC_BY_ID.get(d.id)?.href, d.id).toBe(d.href);
    }
  });

  it("탭 7개: 지표 ≤6 (정의됨) · 바로가기 4–6 (/admin, 접근표 등재) · 추세 정의 · 처리 대기 카테고리 존재", () => {
    expect(ADMIN_DASHBOARD_TABS.map((t) => t.id)).toEqual([...ADMIN_DASHBOARD_TAB_IDS]);
    for (const t of ADMIN_DASHBOARD_TABS) {
      expect(t.metricIds.length).toBeGreaterThan(0);
      expect(t.metricIds.length).toBeLessThanOrEqual(6);
      for (const id of t.metricIds) expect(ADMIN_METRIC_BY_ID.has(id), `${t.id}:${id}`).toBe(true);
      expect(t.shortcuts.length).toBeGreaterThanOrEqual(4);
      expect(t.shortcuts.length).toBeLessThanOrEqual(6);
      for (const s of t.shortcuts) {
        expect(s.href.startsWith("/admin")).toBe(true);
        expect(resolveAdminRouteAccess(s.href).matched, s.href).toBe(true);
      }
      expect(ADMIN_DASHBOARD_TRENDS[t.trend]).toBeDefined();
      if (t.pending.kind === "categories") {
        for (const c of t.pending.categories) expect(ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.has(c)).toBe(true);
      }
      expect(t.shortKo.length).toBeLessThanOrEqual(t.labelKo.length);
    }
  });

  it("요약 띠 = 8칸, 지표는 정의됨, 탭 전환 대상은 실제 탭", () => {
    expect(ADMIN_DASHBOARD_BAND).toHaveLength(8);
    expect(ADMIN_DASHBOARD_BAND.map((b) => b.labelKo)).toEqual([
      "전체 회원",
      "활성·신규",
      "처리 대기",
      "거래",
      "배달 주문",
      "결제·정산",
      "광고",
      "고객지원",
    ]);
    for (const b of ADMIN_DASHBOARD_BAND) {
      expect(ADMIN_METRIC_BY_ID.has(b.primaryMetricId)).toBe(true);
      if (b.secondaryMetricId) expect(ADMIN_METRIC_BY_ID.has(b.secondaryMetricId)).toBe(true);
      if (b.tab) expect(ADMIN_DASHBOARD_TAB_IDS).toContain(b.tab);
    }
  });

  it("전체 현황 도메인 카드 4종 (커뮤니티·거래·배달·채팅)", () => {
    expect(ADMIN_DASHBOARD_DOMAIN_CARDS.map((c) => c.domain)).toEqual(["community", "trade", "delivery", "chat"]);
    for (const c of ADMIN_DASHBOARD_DOMAIN_CARDS) {
      for (const id of c.kpiMetricIds) expect(ADMIN_METRIC_BY_ID.get(id)?.source).toBe(c.domain);
    }
  });

  it("출처 없는 지표는 생략 목록에 사유와 함께 남긴다", () => {
    expect(ADMIN_DASHBOARD_OMITTED_METRICS.map((o) => o.labelKo)).toEqual(
      expect.arrayContaining(["SLA 초과", "광고 환불 실패"])
    );
    for (const o of ADMIN_DASHBOARD_OMITTED_METRICS) expect(o.reason.length).toBeGreaterThan(5);
  });
});

describe("탭·응답 파라미터 파싱", () => {
  it("?tab= — 알려진 탭만, 그 밖 = 전체 현황", () => {
    expect(parseAdminDashboardTab("finance")).toBe("finance");
    expect(parseAdminDashboardTab(" ads_ops ")).toBe("ads_ops");
    expect(parseAdminDashboardTab("bogus")).toBe("overview");
    expect(parseAdminDashboardTab(null)).toBe("overview");
  });

  it("parts / range", () => {
    expect([...parseAdminDashboardParts("band,pending")]).toEqual(["band", "pending"]);
    expect([...parseAdminDashboardParts("x")]).toEqual(["band", "metrics", "trend", "pending"]);
    expect([...parseAdminDashboardParts(null)].length).toBe(4);
    expect(parseAdminDashboardRange("30")).toBe(30);
    expect(parseAdminDashboardRange("14")).toBe(7);
  });
});
