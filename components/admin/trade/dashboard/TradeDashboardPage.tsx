"use client";

/**
 * 거래 대시보드 (설계 v2 §E) — ① 처리 대기(기간 무관) ② 현재 상태 ③ 기간 통계(선택 기간, 필리핀 시간).
 * 모든 카드는 같은 조건의 목록으로 이동한다. 값을 확인하지 못한 지표는 「확인 불가」 (0 으로 표시하지 않음).
 * URL: period=today|7d|30d|custom (+from,to)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useCommunityQueryState, CommunityTimeCell } from "@/components/admin/community/kit/CommunityAdminKit";
import { CommunityStatsPeriodPicker } from "@/components/admin/community/dashboard/CommunityStatsPeriodPicker";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import { AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { buildAdminPrelaunchResetHref, DOMAIN_RESET_SCOPE_PRESETS } from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import { TRADE_POST_TAB_LABEL_KEYS, type TradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";
import { formatTradePoints } from "@/components/admin/trade/kit/TradeAdminKit";
import { tradeAuditActionLabel, tradeAuditTargetLabel } from "@/components/admin/trade/audit/TradeAuditPage";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

type N = number | null;

type OverviewResponse = {
  ok?: boolean;
  error?: string;
  periodKind?: string;
  period?: { fromDate: string | null; toDate: string | null };
  pending?: {
    openReports: N;
    promotionReview: N;
    openSupport: N;
    activeRestrictions: N;
    overduePromotions: N;
  };
  current?: Record<TradePostTab, N> & { activePromotions: N };
  inPeriod?: {
    newPosts: N;
    completed: N;
    adminCompletedNoTime: N;
    reportsReceived: N;
    reportsProcessed: N;
    chatsStarted: N;
    promotionsStarted: N;
    promotionsEnded: N;
    promotionPointsUsed: N;
    promotionPointsRefunded: N;
    supportReceived: N;
    adminActions: N;
  };
  byCategory?: { id: string | null; name: string; count: number }[] | null;
  byRegion?: { lguId: string | null; name: string; count: number }[] | null;
  recentActions?: { id: string; at: string; action: string; targetType: string; targetId: string; actorId: string | null }[] | null;
  errors?: string[];
};

const PERIODS = ["today", "7d", "30d", "custom"];
const GRID = "grid gap-2 sm:grid-cols-2 lg:grid-cols-4";
const POST_TABS: TradePostTab[] = [
  "all",
  "visible",
  "selling",
  "reserved",
  "sold",
  "admin_hidden",
  "admin_deleted",
  "owner_hidden",
  "owner_deleted",
  "reported",
  "unclassified",
];

function n(v: N | undefined): N {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function MetricValue({ value, points }: { value: N; points?: boolean }) {
  if (value === null) return <AdminUnavailableChip ko />;
  return (
    <span className="text-[20px] font-bold leading-7 tabular-nums text-sam-fg">{points ? formatTradePoints(value) : formatAdminNumber(value)}</span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-sam-fg">{title}</h2>
        {hint ? <div className="text-[12px] text-sam-muted">{hint}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  href,
  sub,
  danger,
  points,
}: {
  label: string;
  value: N;
  href?: string;
  sub?: ReactNode;
  danger?: boolean;
  points?: boolean;
}) {
  const body = (
    <div
      className={[
        "flex h-full flex-col justify-between gap-2 rounded-ui-rect border bg-sam-surface p-3",
        danger && (value ?? 0) > 0 ? "border-sam-danger" : "border-sam-border",
        href ? "hover:border-sam-primary" : "",
      ].join(" ")}
    >
      <span className={["text-[13px] font-medium", danger && (value ?? 0) > 0 ? "text-sam-danger" : "text-sam-muted"].join(" ")}>
        {label}
      </span>
      <MetricValue value={value} points={points} />
      {sub ? <span className="text-[12px] text-sam-muted">{sub}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} prefetch={false} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4 text-center text-[13px] text-sam-muted">{text}</p>
  );
}

export function TradeDashboardPage() {
  const { t } = useI18n();
  const q = useCommunityQueryState();
  const rawPeriod = q.get("period");
  const period = PERIODS.includes(rawPeriod) ? rawPeriod : "7d";
  const from = period === "custom" ? q.get("from") : "";
  const to = period === "custom" ? q.get("to") : "";
  const customIncomplete = period === "custom" && (!from || !to);

  const periodQs = new URLSearchParams({ period });
  if (period === "custom") {
    periodQs.set("from", from);
    periodQs.set("to", to);
  }
  const periodSuffix = periodQs.toString();

  const { state, reload } = useCommunityAdminJson<OverviewResponse>(
    customIncomplete ? null : `/api/admin/trade/overview?${periodSuffix}`
  );
  const data = state.data;
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    if (state.status === "ok") setLoadedAt(new Date().toISOString());
  }, [state]);

  const pending = data?.pending;
  const current = data?.current;
  const inPeriod = data?.inPeriod;
  const errors = data?.errors ?? [];
  const range = data?.period;
  const rangeText =
    range?.fromDate && range?.toDate ? (range.fromDate === range.toDate ? range.fromDate : `${range.fromDate} ~ ${range.toDate}`) : "";

  const postsHref = (tab: string) => `/admin/posts-management?tab=${tab}`;
  const adminCompletedNoTime = n(inPeriod?.adminCompletedNoTime);

  return (
    <div data-trade-dashboard="1" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("admin_trade_dash_title")}</h1>
          <p className="mt-1 sam-text-body text-sam-muted">{t("admin_trade_dash_subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-sam-muted">
          <span>{t("admin_trade_dash_last_updated", { time: loadedAt ? `${formatAdminManilaDateTime(loadedAt).slice(11)} PHT` : "—" })}</span>
          <AdminActionButton variant="secondary" disabled={state.status === "loading" || customIncomplete} onClick={reload}>
            {state.status === "loading" ? t("admin_trade_dash_refreshing") : t("admin_trade_dash_refresh")}
          </AdminActionButton>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <CommunityStatsPeriodPicker
          key={`${period}-${from}-${to}`}
          period={period}
          from={from}
          to={to}
          onChange={(v) => q.set({ period: v.period === "7d" ? null : v.period, from: v.from || null, to: v.to || null })}
        />
      </div>

      {customIncomplete ? (
        <EmptyBox text={t("admin_trade_dash_custom_incomplete")} />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : !data ? (
        <AdminLoadingState ko />
      ) : (
        <>
          {errors.length > 0 ? (
            <div role="status" className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-fg">
              {t("admin_trade_dashboard_partial_metrics_failed")}
              <AdminTechDetails ko>
                {errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </AdminTechDetails>
            </div>
          ) : null}

          <Section title={t("admin_trade_dash_pending")} hint={t("admin_trade_dash_pending_hint")}>
            <div className={GRID}>
              <MetricCard label={t("admin_trade_regions_th_open_reports")} value={n(pending?.openReports)} href="/admin/trade/reports?tab=open" danger />
              <MetricCard
                label={t("admin_trade_dash_promo_review")}
                value={n(pending?.promotionReview)}
                href="/admin/trade/promotions?tab=pending_review"
                danger
              />
              <MetricCard label={t("admin_trade_dash_open_support")} value={n(pending?.openSupport)} href="/admin/trade/support" danger />
              <MetricCard label={t("admin_trade_dash_active_restrictions")} value={n(pending?.activeRestrictions)} href="/admin/trade/restrictions" />
              <MetricCard
                label={t("admin_trade_dash_overdue_promos")}
                value={n(pending?.overduePromotions)}
                href="/admin/trade/promotions?tab=active"
                danger
              />
            </div>
          </Section>

          <Section title={t("admin_trade_dash_current")}>
            <div className={GRID}>
              {POST_TABS.map((tab) => (
                <MetricCard
                  key={tab}
                  label={tab === "all" ? t("admin_trade_dash_all_posts") : t(TRADE_POST_TAB_LABEL_KEYS[tab])}
                  value={n(current?.[tab])}
                  href={postsHref(tab)}
                />
              ))}
              <MetricCard label={t("admin_trade_regions_th_promoted")} value={n(current?.activePromotions)} href="/admin/trade/promotions?tab=active" />
            </div>
          </Section>

          <Section title={t("admin_trade_dash_period_stats")} hint={rangeText ? t("admin_trade_dash_range_pht", { range: rangeText }) : undefined}>
            <div className={GRID}>
              <MetricCard
                label={t("admin_trade_dash_new_posts")}
                value={n(inPeriod?.newPosts)}
                href={`/admin/posts-management?tab=all&${periodSuffix}`}
              />
              <MetricCard
                label={t("admin_trade_listing_completed")}
                value={n(inPeriod?.completed)}
                href={postsHref("sold")}
                sub={
                  adminCompletedNoTime === null
                    ? t("admin_trade_dash_admin_completed_unknown")
                    : adminCompletedNoTime > 0
                      ? t("admin_trade_dash_admin_completed_n", { n: formatAdminNumber(adminCompletedNoTime) })
                      : undefined
                }
              />
              <MetricCard
                label={t("admin_trade_dash_reports_received")}
                value={n(inPeriod?.reportsReceived)}
                href={`/admin/trade/reports?tab=all&${periodSuffix}`}
              />
              <MetricCard
                label={t("admin_trade_dash_reports_processed")}
                value={n(inPeriod?.reportsProcessed)}
                href={`/admin/trade/reports?tab=all&${periodSuffix}`}
              />
              <MetricCard label={t("admin_trade_dash_chats_started")} value={n(inPeriod?.chatsStarted)} />
              <MetricCard
                label={t("admin_trade_dash_promos_started")}
                value={n(inPeriod?.promotionsStarted)}
                href={`/admin/trade/promotions?tab=all&${periodSuffix}`}
              />
              <MetricCard
                label={t("admin_trade_dash_promos_ended")}
                value={n(inPeriod?.promotionsEnded)}
                href={`/admin/trade/promotions?tab=ended&${periodSuffix}`}
              />
              <MetricCard
                label={t("admin_trade_dash_promo_points_used")}
                value={n(inPeriod?.promotionPointsUsed)}
                points
                href={`/admin/trade/points?type=promotion_order&${periodSuffix}`}
              />
              <MetricCard
                label={t("admin_trade_dash_promo_points_refunded")}
                value={n(inPeriod?.promotionPointsRefunded)}
                points
                href={`/admin/trade/points?type=promotion_order&${periodSuffix}`}
              />
              <MetricCard label={t("admin_trade_dash_support_received")} value={n(inPeriod?.supportReceived)} href="/admin/trade/support" />
              <MetricCard
                label={t("admin_trade_dash_admin_actions")}
                value={n(inPeriod?.adminActions)}
                href={`/admin/trade/audit?${periodSuffix}`}
              />
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t("admin_trade_dash_by_category")}>
              <TopList
                rows={data.byCategory ?? null}
                render={(r) => ({ key: r.id ?? "none", name: r.name, count: r.count })}
              />
            </Section>
            <Section title={t("admin_trade_dash_by_region")} hint={<Link href="/admin/trade/regions" className="underline">{t("admin_trade_dash_all_regions")}</Link>}>
              <TopList
                rows={data.byRegion ?? null}
                render={(r) => ({
                  key: r.lguId ?? "none",
                  name: r.name,
                  count: r.count,
                  href: r.lguId ? `/admin/posts-management?lguId=${encodeURIComponent(r.lguId)}` : undefined,
                })}
              />
            </Section>
          </div>

          <Section
            title={t("admin_trade_dash_recent_actions")}
            hint={
              <span className="flex gap-3">
                <Link href="/admin/trade/audit" className="underline">{t("admin_trade_dash_all_audit")}</Link>
                <Link href={buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.trade)} className="underline">
                  {t("admin_trade_dashboard_cleanup_test_data")}
                </Link>
              </span>
            }
          >
            {data.recentActions === null || data.recentActions === undefined ? (
              <EmptyBox text={t("admin_trade_dash_recent_unavailable")} />
            ) : data.recentActions.length === 0 ? (
              <EmptyBox text={t("admin_trade_dash_recent_empty")} />
            ) : (
              <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
                {data.recentActions.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/admin/trade/audit?targetType=${encodeURIComponent(r.targetType)}&targetId=${encodeURIComponent(r.targetId)}`}
                      prefetch={false}
                      className="flex items-start justify-between gap-3 px-3 py-2 text-[13px] hover:bg-sam-app"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-sam-fg">{tradeAuditActionLabel(t, r.action)}</span>
                        <span className="block text-[12px] text-sam-muted">{tradeAuditTargetLabel(t, r.targetType)}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-sam-muted">
                        <CommunityTimeCell iso={r.at} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function TopList<T>({
  rows,
  render,
}: {
  rows: T[] | null;
  render: (r: T) => { key: string; name: string; count: number; href?: string };
}) {
  const { t } = useI18n();
  if (rows === null) return <EmptyBox text={t("admin_trade_dash_unavailable")} />;
  if (rows.length === 0) return <EmptyBox text={t("admin_trade_dash_no_items")} />;
  return (
    <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border bg-sam-surface">
      {rows.map((raw) => {
        const r = render(raw);
        const line = (
          <span className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span className="min-w-0 truncate text-sam-fg">{r.name}</span>
            <span className="shrink-0 font-semibold text-sam-fg">{formatAdminNumber(r.count)}</span>
          </span>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} prefetch={false} className="block hover:bg-sam-app">
                {line}
              </Link>
            ) : (
              line
            )}
          </li>
        );
      })}
    </ul>
  );
}
