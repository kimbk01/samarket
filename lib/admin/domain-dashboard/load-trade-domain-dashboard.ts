/**
 * Trade Domain Dashboard (설계 v4 · V3-17) — 거래 대시보드 집계(`loadTradeOverview`)를 도메인 공통 모델로 옮긴다.
 * 통합 대시보드가 커뮤니티·배달·채팅과 같은 모양으로 읽는다. 읽기 전용, 새 집계·DB 객체 없음.
 * 거래 대시보드 화면(`TradeDashboardPage` ← `/api/admin/trade/overview`)은 그대로 둔다.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";
import { loadTradeOverview, type TradeOverview } from "@/lib/admin/trade-admin/trade-metrics";
import { TRADE_METRIC_DEFINITIONS, type TradeMetricDefinition } from "@/lib/admin/metrics/trade-domain-metrics";
import type {
  AdminDomainActionItem,
  AdminDomainDashboardModel,
  AdminDomainMetric,
} from "@/lib/admin/domain-dashboard/types";

function toMetric(def: TradeMetricDefinition, value: number | null): AdminDomainMetric {
  return { id: def.id, labelKo: def.labelKo, labelEn: def.labelEn, value, href: def.href, source: `trade_overview.${def.source}` };
}

function toAction(def: TradeMetricDefinition, value: number | null): AdminDomainActionItem {
  return {
    id: def.id,
    labelKo: def.labelKo,
    labelEn: def.labelEn,
    count: value,
    href: def.href,
    source: `trade_overview.${def.source}`,
    owner: "trade",
  };
}

/** 순수 변환 — `TradeOverview` → 도메인 공통 모델 (테스트 대상). */
export function buildTradeDomainDashboardModel(
  overview: TradeOverview,
  meta: { generatedAt?: string; periodKind?: string } = {}
): AdminDomainDashboardModel {
  const rows = TRADE_METRIC_DEFINITIONS.map((def) => ({ def, value: def.read(overview) }));
  const visible = (r: { def: TradeMetricDefinition; value: number | null }) =>
    r.def.showWhenZero || r.value === null || r.value > 0;
  const section = (s: TradeMetricDefinition["section"]) => rows.filter((r) => r.def.section === s);

  return {
    domain: "trade",
    titleKo: "거래 운영 대시보드",
    titleEn: "Trade operations dashboard",
    descriptionKo: "처리 대기·현재 상태는 지금 시점, 기간 통계는 필리핀 시간 기준입니다.",
    descriptionEn: "Pending work and current state are live; period stats use Philippine time (PHT).",
    currentState: section("state").map((r) => toMetric(r.def, r.value)),
    actionRequired: section("action").filter(visible).map((r) => toAction(r.def, r.value)),
    domainHealth: section("period").map((r) => toMetric(r.def, r.value)),
    issues: section("risk").filter(visible).map((r) => toAction(r.def, r.value)),
    primaryEntries: [
      { id: "reports", labelKo: "거래 신고", labelEn: "Trade reports", href: "/admin/trade/reports?tab=open", frequency: "DAILY_CRITICAL" },
      { id: "posts", labelKo: "거래글", labelEn: "Trade posts", href: "/admin/posts-management", frequency: "FREQUENT" },
      { id: "promotions", labelKo: "홍보", labelEn: "Promotions", href: "/admin/trade/promotions?tab=pending_review", frequency: "FREQUENT" },
      { id: "support", labelKo: "거래 문의", labelEn: "Trade inquiries", href: "/admin/trade/support", frequency: "FREQUENT" },
      { id: "restrictions", labelKo: "거래 제한", labelEn: "Restrictions", href: "/admin/trade/restrictions", frequency: "FREQUENT" },
    ],
    contextEntries: [
      { id: "dashboard", labelKo: "거래 대시보드", labelEn: "Trade dashboard", href: "/admin/trade", frequency: "FREQUENT" },
      { id: "audit", labelKo: "운영 기록", labelEn: "Audit log", href: "/admin/trade/audit", frequency: "OCCASIONAL" },
    ],
    recent: [],
    sectionErrors: [...overview.errors],
    lastUpdatedAt: meta.generatedAt ?? new Date().toISOString(),
    periodRange: {
      period: meta.periodKind ?? "custom",
      from: overview.period.fromDate,
      to: overview.period.toDate,
      timezone: "Asia/Manila",
    },
    periodStats: section("period").map((r) => toMetric(r.def, r.value)),
    metricValues: rows.map((r) => ({
      id: r.def.id,
      section: r.def.section,
      labelKey: `admin_trade_metric.${r.def.id.replace(/^trade\./, "")}`,
      labelKo: r.def.labelKo,
      labelEn: r.def.labelEn,
      value: r.value,
      href: r.def.href,
      forbidden: false,
      showWhenZero: r.def.showWhenZero,
    })),
  };
}

/**
 * 거래 도메인 모델 로드 — 기간 통계 기본 최근 7일(마닐라). `summaryOnly` 로 분포·원장 합계·최근 조치는 생략한다.
 * 거래 영역은 활성 관리자 전원(O-2) — 권한 숨김 없음.
 */
export async function loadTradeDomainDashboard(
  sb: SupabaseClient,
  input: { period?: string | null; from?: string | null; to?: string | null; now?: Date } = {}
): Promise<AdminDomainDashboardModel> {
  let parsed = parseCommunityAdminPeriod(
    { period: input.period ?? "7d", from: input.from, to: input.to },
    { defaultPeriod: "7d", now: input.now }
  );
  if (!parsed.ok) parsed = parseCommunityAdminPeriod({ period: "7d" }, { now: input.now });
  const range = parsed.ok
    ? { fromIso: parsed.fromIso, toIso: parsed.toIso, fromDate: parsed.fromDate, toDate: parsed.toDate }
    : { fromIso: null, toIso: null, fromDate: null, toDate: null };
  const overview = await loadTradeOverview(sb, range, { summaryOnly: true });
  return buildTradeDomainDashboardModel(overview, { periodKind: parsed.ok ? parsed.period : "7d" });
}
