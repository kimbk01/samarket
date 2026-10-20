"use client";

/**
 * 통합 대시보드 (설계 v4 §3) — 요약 띠 8칸 → 탭 7 → 본문(좌: 지표 6칸·추세·공지·바로가기 / 우: 처리 대기 · 최근 활동) → 상태 줄.
 * - 지표 칸: 라벨 · 기간 칩(현재/선택 기간) · 값 + 단위(건·명·곳·₱) · 이동 화살표(→ 필터 적용 화면).
 * - 추세: 선택 기간이 끝나는 날(PHT)에서 끝나는 7일/30일 — 「어제」면 어제에서 끝난다. 정의가 있는 추세(7일 활성)는 정의를 표시.
 * - 페이지는 스크롤하지 않는다. 오른쪽 목록만 안에서 스크롤, 높이가 모자라면(≈690 미만) 본문만 스크롤.
 * - 수치는 `/api/admin/dashboard/overview` (지표 레지스트리) 에서만 받는다. 지표 값 = 링크로 이동한 화면 값.
 *   실패 = 이전 값 + 「불러오기 실패」(0 금지). 기간을 바꾸면 이전 기간 값은 버린다(다른 기간 값을 남기지 않는다).
 * - 상태 줄: 갱신 시각(모든 부분 성공 시에만 바뀜) · 자동 60초 · 새로고침 · 기간(오늘·어제·7일·30일, PHT).
 *   새로고침·자동 갱신은 요약 띠·지표·추세·처리 대기·최근 활동을 모두 다시 읽는다. 창이 숨겨지면 자동 갱신을 멈춘다.
 * - 탭은 주소 `?tab=`, 기간은 `?period=` 에 남는다.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminTabs, adminTabButtonId, adminTabPanelId, type AdminTabItem } from "@/components/admin/ui/AdminTabs";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import {
  ADMIN_DASHBOARD_DEFAULT_TAB,
  ADMIN_DASHBOARD_TABS,
  parseAdminDashboardTab,
  type AdminDashboardTabId,
} from "@/lib/admin/metrics/registry";
import {
  ADMIN_DASHBOARD_DEFAULT_PERIOD,
  ADMIN_DASHBOARD_PERIOD_LABEL,
  ADMIN_DASHBOARD_PERIODS,
  parseAdminDashboardPeriod,
  type AdminDashboardPeriod,
} from "@/lib/admin/metrics/dashboard-period";
import {
  ADMIN_DASHBOARD_UNIT_SUFFIX,
  adminDashboardPayloadHasErrors,
  formatAdminDashboardValue,
  mergeAdminDashboardBand,
  mergeAdminDashboardMetrics,
  mergeAdminDashboardPending,
  type AdminDashboardBandTile,
  type AdminDashboardMetricValue,
  type AdminDashboardNoticesPayload,
  type AdminDashboardOverviewPayload,
  type AdminDashboardPendingPayload,
  type AdminDashboardRecentPayload,
  type AdminDashboardTrendPayload,
} from "@/lib/admin/metrics/dashboard-overview-contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export const ADMIN_DASHBOARD_REFRESH_MS = 60_000;
const TABS_ID = "admin-dashboard";
const SIDE_TABS_ID = "admin-dashboard-side";
const ALL_PARTS = "band,metrics,trend,pending,recent,notices";

export type AdminDashboardTabData = {
  metrics: AdminDashboardMetricValue[];
  shortcuts: NonNullable<AdminDashboardOverviewPayload["shortcuts"]>;
  trend: AdminDashboardTrendPayload | null;
  pending: AdminDashboardPendingPayload | null;
};

export type AdminDashboardInitialState = {
  tab?: AdminDashboardTabId;
  period?: AdminDashboardPeriod;
  band?: AdminDashboardBandTile[];
  tabData?: Partial<Record<AdminDashboardTabId, AdminDashboardTabData>>;
  recent?: AdminDashboardRecentPayload | null;
  notices?: AdminDashboardNoticesPayload | null;
  generatedAt?: string | null;
};

type SidePanel = "pending" | "recent";

const EMPTY_TAB: AdminDashboardTabData = { metrics: [], shortcuts: [], trend: null, pending: null };

const card =
  "rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)]";
const muted = "text-[var(--admin-console-muted)]";
const fg = "text-[var(--admin-console-fg)]";

function markStale(m: AdminDashboardMetricValue): AdminDashboardMetricValue {
  return { ...m, error: m.error ?? "fetch_failed", stale: m.value !== null };
}

function mergeTrend(
  prev: AdminDashboardTrendPayload | null,
  next: AdminDashboardTrendPayload
): AdminDashboardTrendPayload {
  if (next.error && prev && prev.id === next.id && prev.days === next.days && prev.points.length) {
    return { ...next, points: prev.points };
  }
  return next;
}

/** 지표 기간 칩 — 현재 / 오늘(고정) / 선택 기간. */
function periodChipLabel(m: AdminDashboardMetricValue, period: AdminDashboardPeriod, ko: boolean): string {
  if (m.period === "now") return ko ? "현재" : "Now";
  if (m.period === "today_fixed") return ADMIN_DASHBOARD_PERIOD_LABEL.today[ko ? "ko" : "en"];
  return ADMIN_DASHBOARD_PERIOD_LABEL[period][ko ? "ko" : "en"];
}

/** 값 뒤 단위 (건·명·곳 — ₱ 는 값 앞) */
function unitSuffix(unit: AdminDashboardMetricValue["unit"], ko: boolean): string {
  return ADMIN_DASHBOARD_UNIT_SUFFIX[unit][ko ? "ko" : "en"];
}

function PeriodChip({ label }: { label: string }) {
  return (
    <span
      className={`shrink-0 rounded-full bg-[var(--admin-console-hover)] px-1.5 text-[12px] leading-4 ${muted}`}
      data-admin-metric-period-chip="1"
    >
      {label}
    </span>
  );
}

/** 값 + 실패 표시 (실패 시 이전 값 유지, 없으면 「—」). */
function MetricValueText({
  m,
  className,
  failedLabel,
  ko,
}: {
  m: AdminDashboardMetricValue;
  className: string;
  failedLabel: string;
  ko: boolean;
}) {
  const failed = Boolean(m.error);
  const suffix = m.value === null ? "" : unitSuffix(m.unit, ko);
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className={`${className} tabular-nums`} data-admin-metric-value={m.id}>
        {formatAdminDashboardValue(m.value, m.unit)}
      </span>
      {suffix ? (
        <span className={`shrink-0 text-[13px] ${muted}`} data-admin-metric-unit={m.unit}>
          {suffix}
        </span>
      ) : null}
      {failed ? (
        <span className="truncate text-[12px] font-medium text-sam-warning" data-admin-metric-failed="1">
          {failedLabel}
        </span>
      ) : null}
    </span>
  );
}

function BandTileView({
  tile,
  ko,
  period,
  failedLabel,
  onSelectTab,
}: {
  tile: AdminDashboardBandTile;
  ko: boolean;
  period: AdminDashboardPeriod;
  failedLabel: string;
  onSelectTab: (tab: AdminDashboardTabId) => void;
}) {
  const label = ko ? tile.labelKo : tile.labelEn;
  const short = ko ? tile.shortKo : tile.shortEn;
  const secondary = tile.secondary;
  const metricTip = (m: AdminDashboardMetricValue) =>
    `${ko ? m.labelKo : m.labelEn} (${periodChipLabel(m, period, ko)}): ${formatAdminDashboardValue(m.value, m.unit)}${m.value === null ? "" : unitSuffix(m.unit, ko)}`;
  const tip = [metricTip(tile.primary), secondary ? metricTip(secondary) : ""].filter(Boolean).join(" · ");
  // 수정 계획 1-3: 현재 상태 지표에도 「현재」 칩 (기간 적용 대상이 아님을 표시)
  const primaryChip = periodChipLabel(tile.primary, period, ko);
  const body = (
    <>
      <span className={`flex min-w-0 items-center gap-1 text-[12px] font-medium leading-4 ${muted}`}>
        <span className="min-w-0 truncate">
          <span className="hidden min-[1280px]:inline">{label}</span>
          <span className="min-[1280px]:hidden">{short}</span>
        </span>
        {primaryChip ? <PeriodChip label={primaryChip} /> : null}
      </span>
      <MetricValueText m={tile.primary} className={`text-[20px] font-bold leading-7 ${fg}`} failedLabel={failedLabel} ko={ko} />
      {secondary ? (
        <span
          className={`block truncate text-[12px] leading-4 tabular-nums ${muted}`}
          data-admin-band-secondary={secondary.id}
        >
          {(ko ? secondary.shortKo ?? secondary.labelKo : secondary.shortEn ?? secondary.labelEn) +
            (secondary.period === "now" ? "" : `(${periodChipLabel(secondary, period, ko)})`) +
            " "}
          {formatAdminDashboardValue(secondary.value, secondary.unit)}
          {secondary.value === null ? "" : unitSuffix(secondary.unit, ko)}
          {secondary.error ? ` · ${failedLabel}` : ""}
        </span>
      ) : null}
    </>
  );
  const cls = `${card} flex h-full min-w-0 flex-col justify-center overflow-hidden px-2.5 text-left hover:border-[var(--admin-console-accent)] min-[1280px]:px-3`;
  if (tile.tab) {
    const tab = tile.tab;
    return (
      <AdminListItemButton title={tip} className={cls} data-admin-band-tile={tile.id} onClick={() => onSelectTab(tab)}>
        {body}
      </AdminListItemButton>
    );
  }
  return (
    <Link href={tile.href} prefetch={false} title={tip} className={cls} data-admin-band-tile={tile.id}>
      {body}
    </Link>
  );
}

function MetricTile({
  m,
  ko,
  t,
  period,
  failedLabel,
}: {
  m: AdminDashboardMetricValue;
  ko: boolean;
  t: ReturnType<typeof useI18n>["t"];
  period: AdminDashboardPeriod;
  failedLabel: string;
}) {
  const label = ko ? m.labelKo : m.labelEn;
  return (
    <Link
      href={m.href}
      prefetch={false}
      title={label}
      aria-label={`${t("admin_dash_v4_metric_go", { label })}: ${formatAdminDashboardValue(m.value, m.unit)}${m.value === null ? "" : unitSuffix(m.unit, ko)}`}
      data-admin-metric-tile={m.id}
      className={`${card} group flex h-[76px] min-w-0 flex-col justify-center px-3 hover:border-[var(--admin-console-accent)]`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={`min-w-0 truncate text-[13px] leading-5 ${muted}`}>{label}</span>
        <PeriodChip label={periodChipLabel(m, period, ko)} />
        {/* 이동 표시 — 누르면 같은 필터가 걸린 처리 화면으로 간다 */}
        <span aria-hidden className={`ml-auto shrink-0 text-[14px] leading-5 ${muted} group-hover:translate-x-0.5`} data-admin-metric-arrow="1">
          →
        </span>
      </span>
      <MetricValueText m={m} className={`text-[20px] font-bold leading-7 ${fg}`} failedLabel={failedLabel} ko={ko} />
    </Link>
  );
}

/** 막대 추세 — 왼쪽 Y축(최대·중간·0, 단위 포함), 아래 X축(PHT 날짜 MM-DD). */
function TrendView({
  trend,
  ko,
  t,
  failedLabel,
}: {
  trend: AdminDashboardTrendPayload | null;
  ko: boolean;
  t: ReturnType<typeof useI18n>["t"];
  failedLabel: string;
}) {
  const max = Math.max(1, ...(trend?.points ?? []).flatMap((p) => Object.values(p.values)));
  const seriesColors = ["bg-[var(--admin-console-accent)]", "bg-[var(--admin-console-muted)]"];
  const suffix = trend ? unitSuffix(trend.unit, ko) : "";
  const axis = (v: number) => (trend ? `${formatAdminDashboardValue(v, trend.unit)}${suffix}` : "");
  /** 계열별 창 합계 (예: 7일 활성 = 「마지막 로그인」 합계) */
  const seriesTotal = (key: string) => (trend?.points ?? []).reduce((n, p) => n + (p.values[key] ?? 0), 0);
  const definition = trend ? (ko ? trend.definitionKo : trend.definitionEn) : undefined;
  return (
    <section
      data-admin-dashboard-trend={trend?.id ?? ""}
      className={`${card} flex min-h-[160px] flex-1 flex-col px-3 py-2`}
    >
      <header className="flex h-7 shrink-0 items-center gap-2">
        <h2 className={`truncate text-[14px] font-semibold ${fg}`}>{trend ? (ko ? trend.labelKo : trend.labelEn) : "—"}</h2>
        {trend ? (
          <span
            className={`shrink-0 text-[12px] tabular-nums ${muted}`}
            data-admin-trend-days={trend.days}
            data-admin-trend-window={`${trend.fromDay}~${trend.toDay}`}
          >
            {t("admin_dash_v4_trend_window", { from: trend.fromDay.slice(5), to: trend.toDay.slice(5), n: trend.days })}
          </span>
        ) : null}
        {trend?.series.length ? (
          <span className={`flex min-w-0 items-center gap-2 text-[12px] ${muted}`}>
            {trend.series.map((s, i) => (
              <span key={s.key} className="inline-flex items-center gap-1 tabular-nums" data-admin-trend-series-total={s.key}>
                <span className={`inline-block h-2 w-2 rounded-full ${seriesColors[i % 2]}`} aria-hidden />
                {ko ? s.labelKo : s.labelEn}
                {trend.points.length ? ` ${t("admin_dash_v4_trend_total")} ${axis(seriesTotal(s.key))}` : ""}
              </span>
            ))}
          </span>
        ) : null}
        {trend?.error ? <span className="text-[12px] text-sam-warning">{failedLabel}</span> : null}
      </header>
      {definition ? (
        <p className={`shrink-0 text-[12px] leading-4 ${muted}`} data-admin-trend-definition="1">
          {definition}
        </p>
      ) : null}
      {trend && trend.points.length ? (
        <div className="flex min-h-0 flex-1 gap-1 pt-1" role="img" aria-label={ko ? trend.labelKo : trend.labelEn}>
          <div
            className={`flex w-12 shrink-0 flex-col justify-between pb-4 text-right text-[12px] leading-3 tabular-nums ${muted}`}
            data-admin-trend-y-axis="1"
          >
            <span>{axis(max)}</span>
            <span>{axis(Math.round(max / 2))}</span>
            <span>{axis(0)}</span>
          </div>
          <div className="flex min-w-0 flex-1 items-stretch gap-1 border-l border-[var(--admin-console-border)] pl-1">
            {trend.points.map((p, i) => {
              const tip = `${p.key} · ${trend.series
                .map((s) => `${ko ? s.labelKo : s.labelEn} ${formatAdminDashboardValue(p.values[s.key] ?? 0, trend.unit)}`)
                .join(" · ")}`;
              const showLabel = trend.points.length <= 10 || i % 5 === 0 || i === trend.points.length - 1;
              return (
                <div key={p.key} className="flex min-w-0 flex-1 flex-col" title={tip}>
                  <div className="flex min-h-0 flex-1 items-end justify-center gap-px border-b border-[var(--admin-console-border)]">
                    {trend.series.map((s, si) => (
                      <span
                        key={s.key}
                        className={`w-full max-w-4 rounded-t-sm ${seriesColors[si % 2]}`}
                        style={{ height: `${Math.round(((p.values[s.key] ?? 0) / max) * 100)}%`, minHeight: 1 }}
                      />
                    ))}
                  </div>
                  <span className={`h-4 truncate text-center text-[12px] leading-4 tabular-nums ${muted}`}>
                    {showLabel ? p.key.slice(5) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className={`flex flex-1 items-center justify-center text-[13px] ${muted}`}>{t("admin_dash_v4_trend_empty")}</p>
      )}
    </section>
  );
}

function PendingList({
  pending,
  ko,
  t,
  failedLabel,
}: {
  pending: AdminDashboardPendingPayload | null;
  ko: boolean;
  t: ReturnType<typeof useI18n>["t"];
  failedLabel: string;
}) {
  const items = pending?.items ?? [];
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto" data-admin-dashboard-pending-list="1">
      {pending?.error ? <li className="px-3 pt-2 text-[12px] text-sam-warning">{failedLabel}</li> : null}
      {pending && !pending.complete && !pending.error ? (
        <li className="px-3 pt-2 text-[12px] text-sam-warning">{t("admin_dash_v4_pending_incomplete")}</li>
      ) : null}
      {items.length === 0 ? (
        <li className={`px-3 py-6 text-center text-[13px] ${muted}`}>
          {pending ? t("admin_dash_v4_pending_empty") : t("admin_dash_v4_loading")}
        </li>
      ) : (
        items.map((i) => {
          const rowBody = (
            <>
              <span
                className={`shrink-0 rounded-full px-1.5 text-[12px] font-semibold leading-5 ${i.priority === "P0_CRITICAL" ? "bg-sam-danger-soft text-sam-danger" : "bg-[var(--admin-console-hover)] " + muted}`}
              >
                {i.priority.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] font-medium leading-5 ${fg}`}>{ko ? i.titleKo : i.titleEn}</span>
                <span className={`block truncate text-[12px] leading-4 ${muted}`}>
                  {ko ? i.domainKo : i.domainEn}
                  {i.unitNoteKo ? ` · ${ko ? i.unitNoteKo : i.unitNoteEn ?? i.unitNoteKo}` : ""}
                  {i.href ? "" : ` · ${t("admin_dash_v4_pending_no_list")}`}
                </span>
              </span>
              <span className={`shrink-0 text-[16px] font-bold tabular-nums ${fg}`}>
                {formatAdminDashboardValue(i.count, "count")}
              </span>
              {i.status !== "ok" ? <span className="shrink-0 text-[12px] text-sam-warning">{failedLabel}</span> : null}
            </>
          );
          const rowCls =
            "flex h-11 items-center gap-2 border-b border-[var(--admin-console-border)] px-3 min-[1280px]:h-12";
          return (
            <li key={i.key} data-admin-pending-item={i.key}>
              {i.href ? (
                <Link href={i.href} prefetch={false} className={`${rowCls} hover:bg-[var(--admin-console-hover)]`}>
                  {rowBody}
                </Link>
              ) : (
                <div className={rowCls}>{rowBody}</div>
              )}
            </li>
          );
        })
      )}
    </ul>
  );
}

function RecentList({
  recent,
  ko,
  t,
  failedLabel,
}: {
  recent: AdminDashboardRecentPayload | null;
  ko: boolean;
  t: ReturnType<typeof useI18n>["t"];
  failedLabel: string;
}) {
  if (!recent) {
    return <p className={`px-3 py-6 text-center text-[13px] ${muted}`}>{t("admin_dash_v4_loading")}</p>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-admin-dashboard-recent-list="1">
      {recent.error ? <p className="px-3 pt-2 text-[12px] text-sam-warning">{failedLabel}</p> : null}
      {recent.groups.map((g) => (
        <section key={g.kind} data-admin-recent-group={g.kind} className="border-b border-[var(--admin-console-border)]">
          <header className="flex h-8 items-center justify-between gap-2 px-3">
            <h3 className={`truncate text-[13px] font-semibold ${fg}`}>{ko ? g.labelKo : g.labelEn}</h3>
            <Link href={g.href} prefetch={false} className={`shrink-0 text-[12px] underline ${muted}`}>
              {t("admin_dash_v4_view_all")}
            </Link>
          </header>
          {g.items.length === 0 ? (
            <p className={`px-3 pb-2 text-[12px] ${muted}`}>{t("admin_dash_v4_recent_empty")}</p>
          ) : (
            <ul>
              {g.items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    prefetch={false}
                    className="flex h-10 items-center gap-2 px-3 hover:bg-[var(--admin-console-hover)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] leading-5 ${fg}`}>{it.title || "—"}</span>
                      <span className={`block truncate text-[12px] leading-4 ${muted}`}>{it.sub}</span>
                    </span>
                    <span className={`shrink-0 text-[12px] tabular-nums ${muted}`}>
                      {formatAdminManilaDateTime(it.at).slice(5)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** 공지 (고객센터 콘텐츠 최신 5건) — 한 줄 블록, 항목을 누르면 공지 상세로 간다. */
function NoticesStrip({
  notices,
  t,
  failedLabel,
}: {
  notices: AdminDashboardNoticesPayload | null;
  t: ReturnType<typeof useI18n>["t"];
  failedLabel: string;
}) {
  if (!notices) return null;
  const stateLabel = (s: string) =>
    s === "scheduled"
      ? t("admin_dash_v4_notice_state_scheduled")
      : s === "ended"
        ? t("admin_dash_v4_notice_state_ended")
        : s === "hidden"
          ? t("admin_dash_v4_notice_state_hidden")
          : t("admin_dash_v4_notice_state_published");
  return (
    <section
      aria-label={t("admin_dash_v4_notices_title")}
      data-admin-dashboard-notices="1"
      className={`${card} flex h-9 shrink-0 items-center gap-2 overflow-hidden px-3`}
    >
      <h2 className={`shrink-0 text-[13px] font-semibold ${fg}`}>{t("admin_dash_v4_notices_title")}</h2>
      {notices.error ? <span className="shrink-0 text-[12px] text-sam-warning">{failedLabel}</span> : null}
      <ul className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden whitespace-nowrap">
        {notices.items.length === 0 && !notices.error ? (
          <li className={`text-[12px] ${muted}`}>{t("admin_dash_v4_notices_empty")}</li>
        ) : (
          notices.items.map((n) => (
            <li key={n.id} className="min-w-0 shrink" data-admin-notice-item={n.id}>
              <Link href={n.href} prefetch={false} className={`flex min-w-0 items-center gap-1 text-[13px] hover:underline ${fg}`}>
                {n.state !== "published" ? (
                  <span className={`shrink-0 text-[12px] ${muted}`}>[{stateLabel(n.state)}]</span>
                ) : null}
                <span className="min-w-0 max-w-[220px] truncate">{n.title || "—"}</span>
                <span className={`shrink-0 text-[12px] tabular-nums ${muted}`}>
                  {n.at ? formatAdminManilaDateTime(n.at).slice(5, 10) : ""}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
      <Link href={notices.href} prefetch={false} className={`shrink-0 text-[12px] underline ${muted}`}>
        {t("admin_dash_v4_view_all")}
      </Link>
    </section>
  );
}

function SidePanelView({
  side,
  onSide,
  pending,
  recent,
  ko,
  t,
  failedLabel,
}: {
  side: SidePanel;
  onSide: (s: SidePanel) => void;
  pending: AdminDashboardPendingPayload | null;
  recent: AdminDashboardRecentPayload | null;
  ko: boolean;
  t: ReturnType<typeof useI18n>["t"];
  failedLabel: string;
}) {
  const sideTabs: AdminTabItem[] = [
    { id: "pending", label: t("admin_dash_v4_pending_title") },
    { id: "recent", label: t("admin_dash_v4_recent_title") },
  ];
  return (
    <section
      id="action-center"
      data-admin-dashboard-pending="1"
      data-admin-dashboard-side={side}
      className={`${card} flex min-h-0 flex-col overflow-hidden`}
    >
      <header className="relative shrink-0">
        <AdminTabs
          tabs={sideTabs}
          ariaLabel={`${t("admin_dash_v4_pending_title")} · ${t("admin_dash_v4_recent_title")}`}
          value={side}
          syncUrl={false}
          onChange={(id) => onSide(id === "recent" ? "recent" : "pending")}
          idBase={SIDE_TABS_ID}
          className="px-3"
        />
        {side === "pending" && pending ? (
          <span
            className={`pointer-events-none absolute right-3 top-0 flex h-10 items-center text-[12px] tabular-nums ${muted}`}
            data-admin-pending-total="1"
          >
            {t("admin_dash_v4_pending_total", { n: formatAdminDashboardValue(pending.total, "count") })}
          </span>
        ) : null}
      </header>
      <div
        id={adminTabPanelId(SIDE_TABS_ID, side)}
        role="tabpanel"
        aria-labelledby={adminTabButtonId(SIDE_TABS_ID, side)}
        className="flex min-h-0 flex-1 flex-col"
      >
      {side === "pending" ? (
        <PendingList pending={pending} ko={ko} t={t} failedLabel={failedLabel} />
      ) : (
        <RecentList recent={recent} ko={ko} t={t} failedLabel={failedLabel} />
      )}
      </div>
    </section>
  );
}

export function AdminDashboardView({ initial }: { initial?: AdminDashboardInitialState }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const tab = parseAdminDashboardTab(searchParams?.get("tab") ?? initial?.tab ?? null);
  const period = parseAdminDashboardPeriod(searchParams?.get("period") ?? initial?.period ?? null);
  const failedLabel = t("admin_dash_v4_load_failed");

  const [band, setBand] = useState<AdminDashboardBandTile[]>(initial?.band ?? []);
  const [tabData, setTabData] = useState<Partial<Record<AdminDashboardTabId, AdminDashboardTabData>>>(
    initial?.tabData ?? {}
  );
  const [recent, setRecent] = useState<AdminDashboardRecentPayload | null>(initial?.recent ?? null);
  const [notices, setNotices] = useState<AdminDashboardNoticesPayload | null>(initial?.notices ?? null);
  const [side, setSide] = useState<SidePanel>("pending");
  const [generatedAt, setGeneratedAt] = useState<string | null>(initial?.generatedAt ?? null);
  const [status, setStatus] = useState<"idle" | "loading" | "partial" | "failed">("idle");
  /** 화면에 있는 값의 기간 — 다른 기간 응답·이전 값이 섞이지 않게 한다. */
  const periodRef = useRef<AdminDashboardPeriod>(period);
  const requestSeq = useRef(0);

  const load = useCallback(async (target: AdminDashboardTabId, forPeriod: AdminDashboardPeriod, parts: string) => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/admin/dashboard/overview?tab=${encodeURIComponent(target)}&parts=${parts}&period=${forPeriod}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => null)) as AdminDashboardOverviewPayload | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(`http_${res.status}`);
      if (forPeriod !== periodRef.current) return;
      if (json.band) setBand((prev) => mergeAdminDashboardBand(prev, json.band ?? []));
      if (json.recent) setRecent(json.recent);
      if (json.notices) {
        const nextNotices = json.notices;
        // 실패면 이전 목록 유지 + 오류 표시 (빈 목록으로 바꾸지 않는다)
        setNotices((prev) => (nextNotices.error && prev ? { ...prev, error: nextNotices.error } : nextNotices));
      }
      setTabData((prev) => {
        const cur = prev[target] ?? EMPTY_TAB;
        const next: AdminDashboardTabData = { ...cur };
        if (json.metrics) next.metrics = mergeAdminDashboardMetrics(cur.metrics, json.metrics);
        if (json.shortcuts) next.shortcuts = json.shortcuts;
        if (json.trend) next.trend = mergeTrend(cur.trend, json.trend);
        if (json.pending) next.pending = cur.pending ? mergeAdminDashboardPending(cur.pending, json.pending) : json.pending;
        return { ...prev, [target]: next };
      });
      const partial = adminDashboardPayloadHasErrors(json);
      // 「갱신 시각」은 요청한 모든 부분이 성공했을 때만 바꾼다.
      if (!partial) setGeneratedAt(json.generatedAt);
      if (seq === requestSeq.current) setStatus(partial ? "partial" : "idle");
    } catch {
      if (forPeriod !== periodRef.current) return;
      // 전체 요청 실패 — 이전 값을 그대로 두고 「불러오기 실패」만 표시 (0 으로 바꾸지 않는다)
      if (seq === requestSeq.current) setStatus("failed");
      if (parts.includes("band")) {
        setBand((prev) =>
          prev.map((b) => ({ ...b, primary: markStale(b.primary), secondary: b.secondary ? markStale(b.secondary) : null }))
        );
      }
      if (parts.includes("recent")) setRecent((prev) => (prev ? { ...prev, error: "fetch_failed" } : prev));
      if (parts.includes("notices")) setNotices((prev) => (prev ? { ...prev, error: "fetch_failed" } : prev));
      setTabData((prev) => {
        const cur = prev[target];
        if (!cur) return prev;
        return {
          ...prev,
          [target]: {
            ...cur,
            metrics: parts.includes("metrics") ? cur.metrics.map(markStale) : cur.metrics,
            pending: parts.includes("pending") && cur.pending ? { ...cur.pending, error: "fetch_failed" } : cur.pending,
            trend: parts.includes("trend") && cur.trend ? { ...cur.trend, error: "fetch_failed" } : cur.trend,
          },
        };
      });
    }
  }, []);

  // 기간이 바뀌면 이전 기간 값을 버리고 처음부터 읽는다 (아래 진입 효과보다 먼저 실행).
  useEffect(() => {
    if (periodRef.current === period) return;
    periodRef.current = period;
    setBand([]);
    setTabData({});
    setRecent(null);
    setNotices(null);
    setGeneratedAt(null);
  }, [period]);

  const refreshAll = useCallback(() => {
    void load(tab, periodRef.current, ALL_PARTS);
  }, [load, tab]);

  // 탭·기간 진입: 전부 읽는다.
  useEffect(() => {
    void load(tab, period, ALL_PARTS);
  }, [load, tab, period]);

  // 60초 자동 갱신 (전부) — 창이 숨겨지면 멈추고, 다시 보이면 즉시 갱신
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    const id = window.setInterval(tick, ADMIN_DASHBOARD_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshAll]);

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (value === null) sp.delete(key);
      else sp.set(key, value);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectTab = useCallback(
    (next: AdminDashboardTabId) => replaceParam("tab", next === ADMIN_DASHBOARD_DEFAULT_TAB ? null : next),
    [replaceParam]
  );
  const selectPeriod = useCallback(
    (next: AdminDashboardPeriod) => replaceParam("period", next === ADMIN_DASHBOARD_DEFAULT_PERIOD ? null : next),
    [replaceParam]
  );

  const tabItems: AdminTabItem[] = useMemo(
    () =>
      ADMIN_DASHBOARD_TABS.map((d) => ({
        id: d.id,
        label: (
          <>
            <span className="hidden min-[1280px]:inline">{ko ? d.labelKo : d.labelEn}</span>
            <span className="min-[1280px]:hidden">{ko ? d.shortKo : d.shortEn}</span>
          </>
        ),
      })),
    [ko]
  );

  const data = tabData[tab] ?? EMPTY_TAB;
  const updated = generatedAt ? `${formatAdminManilaDateTime(generatedAt).slice(11)} PHT` : "—";

  return (
    <div
      data-admin-dashboard="v4"
      data-admin-dashboard-tab={tab}
      data-admin-dashboard-period={period}
      className="flex h-full min-h-0 flex-col"
    >
      <h1 className="sr-only">{t("admin_menu_dashboard")}</h1>

      <section
        aria-label={t("admin_dash_v4_band_aria")}
        data-admin-dashboard-band="1"
        className="grid h-[72px] shrink-0 grid-cols-8 gap-2 min-[1280px]:h-20"
      >
        {band.map((b) => (
          <BandTileView key={b.id} tile={b} ko={ko} period={period} failedLabel={failedLabel} onSelectTab={selectTab} />
        ))}
      </section>

      <AdminTabs
        tabs={tabItems}
        ariaLabel={t("admin_dash_v4_tabs_aria")}
        defaultValue={ADMIN_DASHBOARD_DEFAULT_TAB}
        idBase={TABS_ID}
        className="mt-3 shrink-0"
      />

      <div
        id={adminTabPanelId(TABS_ID, tab)}
        role="tabpanel"
        aria-labelledby={adminTabButtonId(TABS_ID, tab)}
        data-admin-dashboard-body="1"
        className="mt-3 min-h-0 flex-1 overflow-y-auto"
      >
        <div className="grid h-full min-h-[420px] grid-cols-[minmax(0,1fr)_316px] gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_344px]">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <div className="grid shrink-0 grid-cols-3 gap-2" data-admin-dashboard-metrics="1">
              {data.metrics.map((m) => (
                <MetricTile key={m.id} m={m} ko={ko} t={t} period={period} failedLabel={failedLabel} />
              ))}
            </div>
            <TrendView trend={data.trend} ko={ko} t={t} failedLabel={failedLabel} />
            <NoticesStrip notices={notices} t={t} failedLabel={failedLabel} />
            {data.shortcuts.length ? (
              <nav
                aria-label={t("admin_dash_v4_shortcuts")}
                data-admin-dashboard-shortcuts="1"
                className="flex h-8 shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap"
              >
                {data.shortcuts.map((s) => (
                  <Link
                    key={s.id}
                    href={s.href}
                    prefetch={false}
                    className="sam-btn sam-btn--outline sam-btn--sm shrink-0"
                    data-admin-dashboard-shortcut={s.id}
                  >
                    {ko ? s.labelKo : s.labelEn}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <SidePanelView
            side={side}
            onSide={setSide}
            pending={data.pending}
            recent={recent}
            ko={ko}
            t={t}
            failedLabel={failedLabel}
          />
        </div>
      </div>

      <footer
        data-admin-dashboard-status="1"
        className={`mt-2 flex h-8 shrink-0 items-center gap-3 text-[12px] ${muted}`}
      >
        <span className="tabular-nums" data-admin-dashboard-updated="1">
          {t("admin_dash_v4_updated", { time: updated })}
        </span>
        <span>· {t("admin_dash_v4_auto_refresh")}</span>
        <AdminActionButton
          variant="secondary"
          size="sm"
          onClick={refreshAll}
          disabled={status === "loading"}
          data-admin-dashboard-refresh="1"
        >
          {status === "loading" ? t("admin_dash_v4_loading") : t("admin_dash_v4_refresh")}
        </AdminActionButton>
        {status === "failed" ? <span className="text-sam-warning">{failedLabel}</span> : null}
        {status === "partial" ? <span className="text-sam-warning">{t("admin_dash_v4_partial_failed")}</span> : null}
        <span className="ml-auto flex items-center gap-1" role="group" aria-label={t("admin_dash_v4_period_label")}>
          <span>{t("admin_dash_v4_period_label")}:</span>
          {ADMIN_DASHBOARD_PERIODS.map((p) => (
            <AdminChipButton
              key={p}
              selected={period === p}
              data-admin-dashboard-period-option={p}
              onClick={() => selectPeriod(p)}
            >
              {ADMIN_DASHBOARD_PERIOD_LABEL[p][ko ? "ko" : "en"]}
            </AdminChipButton>
          ))}
          <span>(PHT)</span>
        </span>
      </footer>
    </div>
  );
}

/** `useSearchParams` 를 쓰므로 Suspense 경계 안에서 렌더한다. */
export function AdminDashboardPage({ initial }: { initial?: AdminDashboardInitialState } = {}) {
  return (
    <Suspense fallback={<div data-admin-dashboard="v4" className="h-full" aria-busy="true" />}>
      <AdminDashboardView initial={initial} />
    </Suspense>
  );
}
