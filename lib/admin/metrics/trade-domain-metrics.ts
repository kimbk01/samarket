/**
 * 거래 지표 정의 (설계 v4 §3 · V3-17) — 거래 대시보드(`/api/admin/trade/overview`)가 계산하는 값을
 * 도메인 공통 모델(`AdminDomainDashboardModel`)과 통합 대시보드가 같은 id 로 읽게 하는 단일 정의.
 *
 * - 값은 `loadTradeOverview`(lib/admin/trade-admin/trade-metrics.ts) 결과에서만 읽는다 (새 집계 없음).
 * - 값을 확인할 수 없으면 null (「확인 불가」, 0 표시 금지).
 * - href = 거래 대시보드가 같은 숫자에 거는 처리 화면 링크와 동일.
 *
 * 클라이언트 안전 — 서버 전용 모듈은 type 으로만 참조한다.
 */
import type { TradeOverview } from "@/lib/admin/trade-admin/trade-metrics";
import { TRADE_POST_TAB_LABELS, TRADE_POST_TABS, type TradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";

export type TradeMetricSection = "action" | "risk" | "state" | "period";

export type TradeMetricDefinition = {
  id: string;
  labelKo: string;
  labelEn: string;
  section: TradeMetricSection;
  /** `TradeOverview` 의 경로 (출처 문서화) */
  source: string;
  href: string;
  showWhenZero: boolean;
  read: (o: TradeOverview) => number | null;
};

const TRADE_POST_TAB_LABELS_EN: Record<TradePostTab, string> = {
  all: "All trade posts",
  visible: "Visible in app",
  selling: "Selling",
  reserved: "Reserved",
  sold: "Sold",
  admin_hidden: "Hidden by admin",
  admin_deleted: "Deleted by admin",
  owner_hidden: "Hidden by seller",
  owner_deleted: "Deleted by seller",
  reported: "Reported",
  unclassified: "Needs classification",
};

export function tradePostsListHref(tab: TradePostTab): string {
  return `/admin/posts-management?tab=${tab}`;
}

export const TRADE_METRIC_DEFINITIONS: readonly TradeMetricDefinition[] = [
  {
    id: "trade.reports_open",
    labelKo: "처리할 거래 신고",
    labelEn: "Open trade reports",
    section: "action",
    source: "pending.openReports",
    href: "/admin/trade/reports?tab=open",
    showWhenZero: false,
    read: (o) => o.pending.openReports,
  },
  {
    id: "trade.promotion_review",
    labelKo: "홍보 승인 대기",
    labelEn: "Promotions pending review",
    section: "action",
    source: "pending.promotionReview",
    href: "/admin/trade/promotions?tab=pending_review",
    showWhenZero: false,
    read: (o) => o.pending.promotionReview,
  },
  {
    id: "trade.support_open",
    labelKo: "답변 대기 거래 문의",
    labelEn: "Trade inquiries waiting",
    section: "action",
    source: "pending.openSupport",
    href: "/admin/trade/support",
    showWhenZero: false,
    read: (o) => o.pending.openSupport,
  },
  {
    id: "trade.promotions_overdue",
    labelKo: "종료일 지난 홍보",
    labelEn: "Promotions past end date",
    section: "risk",
    source: "pending.overduePromotions",
    href: "/admin/trade/promotions?tab=active",
    showWhenZero: false,
    read: (o) => o.pending.overduePromotions,
  },
  {
    id: "trade.restrictions_active",
    labelKo: "진행 중인 거래 제한",
    labelEn: "Active trade restrictions",
    section: "state",
    source: "pending.activeRestrictions",
    href: "/admin/trade/restrictions",
    showWhenZero: true,
    read: (o) => o.pending.activeRestrictions,
  },
  ...TRADE_POST_TABS.map(
    (tab): TradeMetricDefinition => ({
      id: `trade.posts.${tab}`,
      labelKo: tab === "all" ? "전체 거래글" : `거래글 · ${TRADE_POST_TAB_LABELS[tab]}`,
      labelEn: tab === "all" ? TRADE_POST_TAB_LABELS_EN.all : `Trade posts · ${TRADE_POST_TAB_LABELS_EN[tab]}`,
      section: "state",
      source: `current.${tab} (countTradePosts — 목록 total 과 같은 조건)`,
      href: tradePostsListHref(tab),
      showWhenZero: true,
      read: (o) => o.current[tab] ?? null,
    })
  ),
  {
    id: "trade.promotions_active",
    labelKo: "노출 중인 홍보",
    labelEn: "Promotions live",
    section: "state",
    source: "current.activePromotions",
    href: "/admin/trade/promotions?tab=active",
    showWhenZero: true,
    read: (o) => o.current.activePromotions,
  },
  {
    id: "trade.period.new_posts",
    labelKo: "새 거래글 (기간)",
    labelEn: "New trade posts (period)",
    section: "period",
    source: "inPeriod.newPosts",
    href: "/admin/posts-management?tab=all",
    showWhenZero: true,
    read: (o) => o.inPeriod.newPosts,
  },
  {
    id: "trade.period.completed",
    labelKo: "거래 완료 (기간)",
    labelEn: "Trades completed (period)",
    section: "period",
    source: "inPeriod.completed",
    href: tradePostsListHref("sold"),
    showWhenZero: true,
    read: (o) => o.inPeriod.completed,
  },
  {
    id: "trade.period.reports_received",
    labelKo: "접수된 신고 (기간)",
    labelEn: "Reports received (period)",
    section: "period",
    source: "inPeriod.reportsReceived",
    href: "/admin/trade/reports?tab=all",
    showWhenZero: true,
    read: (o) => o.inPeriod.reportsReceived,
  },
  {
    id: "trade.period.reports_processed",
    labelKo: "처리한 신고 (기간)",
    labelEn: "Reports processed (period)",
    section: "period",
    source: "inPeriod.reportsProcessed",
    href: "/admin/trade/reports?tab=all",
    showWhenZero: true,
    read: (o) => o.inPeriod.reportsProcessed,
  },
  {
    id: "trade.period.chats_started",
    labelKo: "시작된 거래 채팅 (기간)",
    labelEn: "Trade chats started (period)",
    section: "period",
    source: "inPeriod.chatsStarted",
    href: "/admin/trade",
    showWhenZero: true,
    read: (o) => o.inPeriod.chatsStarted,
  },
];

export const TRADE_METRIC_BY_ID: ReadonlyMap<string, TradeMetricDefinition> = new Map(
  TRADE_METRIC_DEFINITIONS.map((d) => [d.id, d])
);
