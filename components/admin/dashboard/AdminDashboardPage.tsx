"use client";

/**
 * 통합 대시보드 (설계 v4 §3 · F4) — 요약 띠 8칸 → 탭 7 → 본문(좌: 지표 3×2·추세·바로가기 / 우: 처리 대기) → 상태 줄.
 * - 페이지는 스크롤하지 않는다. 처리 대기 목록만 안에서 스크롤, 높이가 모자라면(≈690 미만) 본문만 스크롤.
 * - 수치는 `/api/admin/dashboard/overview` (지표 레지스트리) 에서만 받는다. 실패 = 이전 값 + 「불러오기 실패」(0 금지).
 * - 요약 띠·처리 대기는 60초 자동 갱신(창이 숨겨지면 멈춤), 추세는 수동 갱신.
 * - 탭은 주소 `?tab=` 에 남는다 (AdminTabs).
 * 공지 카드(자리표시자)는 첫 화면 예산(§3 세로 예산)에 들어가지 않아 제외했다.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminTabs, adminTabButtonId, adminTabPanelId, type AdminTabItem } from "@/components/admin/ui/AdminTabs";
import {
  ADMIN_DASHBOARD_DEFAULT_TAB,
  ADMIN_DASHBOARD_TABS,
  parseAdminDashboardTab,
  type AdminDashboardTabId,
} from "@/lib/admin/metrics/registry";
import {
  formatAdminDashboardValue,
  mergeAdminDashboardBand,
  mergeAdminDashboardMetrics,
  mergeAdminDashboardPending,
  type AdminDashboardBandTile,
  type AdminDashboardDomainCard,
  type AdminDashboardMetricValue,
  type AdminDashboardOverviewPayload,
  type AdminDashboardPendingPayload,
  type AdminDashboardTrendPayload,
} from "@/lib/admin/metrics/dashboard-overview-contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export const ADMIN_DASHBOARD_REFRESH_MS = 60_000;
const TABS_ID = "admin-dashboard";

export type AdminDashboardTabData = {
  metrics: AdminDashboardMetricValue[];
  domainCards: AdminDashboardDomainCard[];
  shortcuts: NonNullable<AdminDashboardOverviewPayload["shortcuts"]>;
  trend: AdminDashboardTrendPayload | null;
  pending: AdminDashboardPendingPayload | null;
};

export type AdminDashboardInitialState = {
  tab?: AdminDashboardTabId;
  band?: AdminDashboardBandTile[];
  tabData?: Partial<Record<AdminDashboardTabId, AdminDashboardTabData>>;
  generatedAt?: string | null;
};

const EMPTY_TAB: AdminDashboardTabData = { metrics: [], domainCards: [], shortcuts: [], trend: null, pending: null };

const card =
  "rounded-ui-rect border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)]";
const muted = "text-[var(--admin-console-muted,#667085)]";
const fg = "text-[var(--admin-console-fg,#1f2937)]";

function markStale(m: AdminDashboardMetricValue): AdminDashboardMetricValue {
  return { ...m, error: m.error ?? "fetch_failed", stale: m.value !== null };
}

function mergeDomainCards(
  prev: readonly AdminDashboardDomainCard[],
  next: readonly AdminDashboardDomainCard[]
): AdminDashboardDomainCard[] {
  const byDomain = new Map(prev.map((c) => [c.domain, c]));
  return next.map((c) => {
    const p = byDomain.get(c.domain);
    return {
      ...c,
      kpis: mergeAdminDashboardMetrics(p?.kpis, c.kpis),
      pending: c.pending ?? (c.error ? (p?.pending ?? null) : null),
      risk: c.risk ?? (c.error ? (p?.risk ?? null) : null),
    };
  });
}

function mergeTrend(
  prev: AdminDashboardTrendPayload | null,
  next: AdminDashboardTrendPayload
): AdminDashboardTrendPayload {
  if (next.error && prev && prev.id === next.id && prev.range === next.range && prev.points.length) {
    return { ...next, points: prev.points };
  }
  return next;
}

/** 값 + 실패 표시 (실패 시 이전 값 유지, 없으면 「—」). */
function MetricValueText({
  m,
  className,
  failedLabel,
}: {
  m: AdminDashboardMetricValue;
  className: string;
  failedLabel: string;
}) {
  const failed = Boolean(m.error);
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className={`${className} tabular-nums`} data-admin-metric-value={m.id}>
        {formatAdminDashboardValue(m.value, m.unit)}
      </span>
      {failed ? (
        <span className="truncate text-[11px] font-medium text-sam-warning" data-admin-metric-failed="1">
          {failedLabel}
        </span>
      ) : null}
    </span>
  );
}

function BandTileView({
  tile,
  ko,
  failedLabel,
  onSelectTab,
}: {
  tile: AdminDashboardBandTile;
  ko: boolean;
  failedLabel: string;
  onSelectTab: (tab: AdminDashboardTabId) => void;
}) {
  const label = ko ? tile.labelKo : tile.labelEn;
  const short = ko ? tile.shortKo : tile.shortEn;
  const secondary = tile.secondary;
  const tip = [
    `${ko ? tile.primary.labelKo : tile.primary.labelEn}: ${formatAdminDashboardValue(tile.primary.value, tile.primary.unit)}`,
    secondary ? `${ko ? secondary.labelKo : secondary.labelEn}: ${formatAdminDashboardValue(secondary.value, secondary.unit)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <span className={`block truncate text-[12px] font-medium leading-4 ${muted}`}>
        <span className="hidden min-[1200px]:inline">{label}</span>
        <span className="min-[1200px]:hidden">{short}</span>
      </span>
      <MetricValueText m={tile.primary} className={`text-[20px] font-bold leading-7 ${fg}`} failedLabel={failedLabel} />
      {secondary ? (
        <span className={`hidden truncate text-[12px] leading-4 tabular-nums min-[1200px]:block ${muted}`}>
          {(ko ? secondary.shortKo ?? secondary.labelKo : secondary.shortEn ?? secondary.labelEn) + " "}
          {formatAdminDashboardValue(secondary.value, secondary.unit)}
          {secondary.error ? ` · ${failedLabel}` : ""}
        </span>
      ) : null}
    </>
  );
  const cls = `${card} flex h-full min-w-0 flex-col justify-center overflow-hidden px-2.5 text-left hover:border-[var(--admin-console-accent,#1d4ed8)] min-[1200px]:px-3`;
  if (tile.tab) {
    const tab = tile.tab;
    return (
      <button type="button" title={tip} className={cls} data-admin-band-tile={tile.id} onClick={() => onSelectTab(tab)}>
        {body}
      </button>
    );
  }
  return (
    <Link href={tile.href} prefetch={false} title={tip} className={cls} data-admin-band-tile={tile.id}>
      {body}
    </Link>
  );
}

function MetricTile({ m, ko, failedLabel }: { m: AdminDashboardMetricValue; ko: boolean; failedLabel: string }) {
  return (
    <Link
      href={m.href}
      prefetch={false}
      title={ko ? m.labelKo : m.labelEn}
      data-admin-metric-tile={m.id}
      className={`${card} flex h-[76px] min-w-0 flex-col justify-center px-3 hover:border-[var(--admin-console-accent,#1d4ed8)]`}
    >
      <span className={`truncate text-[13px] leading-5 ${muted}`}>{ko ? m.labelKo : m.labelEn}</span>
      <MetricValueText m={m} className={`text-[20px] font-bold leading-7 ${fg}`} failedLabel={failedLabel} />
    </Link>
  );
}

function DomainCardView({
  c,
  ko,
  t,
  failedLabel,
}: {
  c: AdminDashboardDomainCard;
  ko: boolean;
  t: (k: "admin_dash_v4_domain_pending" | "admin_dash_v4_domain_risk") => string;
  failedLabel: string;
}) {
  const n = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-PH"));
  return (
    <Link
      href={c.href}
      prefetch={false}
      data-admin-domain-card={c.domain}
      className={`${card} flex h-[76px] min-w-0 flex-col justify-between px-2.5 py-1.5 hover:border-[var(--admin-console-accent,#1d4ed8)]`}
    >
      <span className="flex min-w-0 items-baseline justify-between gap-1">
        <span className={`truncate text-[13px] font-semibold ${fg}`}>{ko ? c.labelKo : c.labelEn}</span>
        {c.error ? <span className="shrink-0 text-[11px] text-sam-warning">{failedLabel}</span> : null}
      </span>
      <span className="flex min-w-0 gap-2">
        {c.kpis.map((k) => (
          <span key={k.id} className="min-w-0 flex-1" title={ko ? k.labelKo : k.labelEn}>
            <span className={`block text-[15px] font-bold leading-5 tabular-nums ${fg}`} data-admin-metric-value={k.id}>
              {formatAdminDashboardValue(k.value, k.unit)}
            </span>
          </span>
        ))}
      </span>
      <span className={`truncate text-[12px] leading-4 tabular-nums ${muted}`}>
        {t("admin_dash_v4_domain_pending")} {n(c.pending)} · {t("admin_dash_v4_domain_risk")} {n(c.risk)}
      </span>
    </Link>
  );
}

function TrendView({
  trend,
  ko,
  t,
  onRange,
  onRefresh,
  failedLabel,
}: {
  trend: AdminDashboardTrendPayload | null;
  ko: boolean;
  t: ReturnType<typeof useI18n>["t"];
  onRange: (r: 7 | 30) => void;
  onRefresh: () => void;
  failedLabel: string;
}) {
  const max = Math.max(1, ...(trend?.points ?? []).flatMap((p) => Object.values(p.values)));
  const seriesColors = ["bg-[var(--admin-console-accent,#1d4ed8)]", "bg-[var(--admin-console-muted,#667085)]"];
  return (
    <section
      data-admin-dashboard-trend={trend?.id ?? ""}
      className={`${card} flex min-h-[160px] flex-1 flex-col px-3 py-2`}
    >
      <header className="flex h-7 shrink-0 items-center gap-2">
        <h2 className={`truncate text-[14px] font-semibold ${fg}`}>{trend ? (ko ? trend.labelKo : trend.labelEn) : "—"}</h2>
        {trend?.series.length ? (
          <span className={`hidden items-center gap-2 text-[12px] min-[1200px]:flex ${muted}`}>
            {trend.series.map((s, i) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${seriesColors[i % 2]}`} aria-hidden />
                {ko ? s.labelKo : s.labelEn}
              </span>
            ))}
          </span>
        ) : null}
        {trend?.error ? <span className="text-[12px] text-sam-warning">{failedLabel}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {trend && trend.ranges.length > 1
            ? trend.ranges.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={trend.range === r}
                  onClick={() => onRange(r)}
                  className={`h-7 rounded-full px-2 text-[12px] ${trend.range === r ? "bg-[var(--admin-console-active-bg,#e8eefc)] font-semibold text-[var(--admin-console-accent,#1d4ed8)]" : muted}`}
                >
                  {t("admin_dash_v4_trend_days", { n: r })}
                </button>
              ))
            : null}
          <button
            type="button"
            onClick={onRefresh}
            className={`h-7 rounded-ui-rect px-2 text-[12px] hover:bg-[var(--admin-console-hover,#eef1f6)] ${muted}`}
          >
            {t("admin_dash_v4_trend_refresh")}
          </button>
        </span>
      </header>
      {trend && trend.points.length ? (
        <div className="flex min-h-0 flex-1 items-stretch gap-1 pt-1" role="img" aria-label={ko ? trend.labelKo : trend.labelEn}>
          {trend.points.map((p, i) => {
            const tip = `${p.key} · ${trend.series
              .map((s) => `${ko ? s.labelKo : s.labelEn} ${formatAdminDashboardValue(p.values[s.key] ?? 0, trend.unit)}`)
              .join(" · ")}`;
            const showLabel = trend.bucket === "daily" ? trend.points.length <= 10 || i % 5 === 0 : i % 3 === 0;
            return (
              <div key={p.key} className="flex min-w-0 flex-1 flex-col" title={tip}>
                <div className="flex min-h-0 flex-1 items-end justify-center gap-px">
                  {trend.series.map((s, si) => (
                    <span
                      key={s.key}
                      className={`w-full max-w-4 rounded-t-sm ${seriesColors[si % 2]}`}
                      style={{ height: `${Math.round(((p.values[s.key] ?? 0) / max) * 100)}%`, minHeight: 1 }}
                    />
                  ))}
                </div>
                <span className={`h-4 truncate text-center text-[11px] leading-4 tabular-nums ${muted}`}>
                  {showLabel ? (trend.bucket === "daily" ? p.key.slice(5) : p.key) : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={`flex flex-1 items-center justify-center text-[13px] ${muted}`}>{t("admin_dash_v4_trend_empty")}</p>
      )}
    </section>
  );
}

function PendingView({
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
    <section
      id="action-center"
      data-admin-dashboard-pending="1"
      className={`${card} flex min-h-0 flex-col overflow-hidden`}
      aria-labelledby="admin-dashboard-pending-title"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--admin-console-border,#d0d7e2)] px-3">
        <h2 id="admin-dashboard-pending-title" className={`text-[14px] font-semibold ${fg}`}>
          {t("admin_dash_v4_pending_title")}
        </h2>
        {pending?.error ? <span className="text-[12px] text-sam-warning">{failedLabel}</span> : null}
        {pending && !pending.complete && !pending.error ? (
          <span className="truncate text-[12px] text-sam-warning">{t("admin_dash_v4_pending_incomplete")}</span>
        ) : null}
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto" data-admin-dashboard-pending-list="1">
        {items.length === 0 ? (
          <li className={`px-3 py-6 text-center text-[13px] ${muted}`}>
            {pending ? t("admin_dash_v4_pending_empty") : t("admin_dash_v4_loading")}
          </li>
        ) : (
          items.map((i) => {
            const rowBody = (
              <>
                <span
                  className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold leading-5 ${i.priority === "P0_CRITICAL" ? "bg-sam-danger-soft text-sam-danger" : "bg-[var(--admin-console-hover,#eef1f6)] " + muted}`}
                >
                  {i.priority.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-medium leading-5 ${fg}`}>{ko ? i.titleKo : i.titleEn}</span>
                  <span className={`block truncate text-[12px] leading-4 ${muted}`}>
                    {ko ? i.domainKo : i.domainEn}
                    {i.href ? "" : ` · ${t("admin_dash_v4_pending_no_list")}`}
                  </span>
                </span>
                <span className={`shrink-0 text-[15px] font-bold tabular-nums ${fg}`}>
                  {i.count === null ? "—" : i.count.toLocaleString("en-PH")}
                </span>
                {i.status !== "ok" ? <span className="shrink-0 text-[11px] text-sam-warning">{failedLabel}</span> : null}
              </>
            );
            const rowCls =
              "flex h-11 items-center gap-2 border-b border-[var(--admin-console-border,#d0d7e2)] px-3 min-[1200px]:h-12";
            return (
              <li key={i.key} data-admin-pending-item={i.key}>
                {i.href ? (
                  <Link href={i.href} prefetch={false} className={`${rowCls} hover:bg-[var(--admin-console-hover,#eef1f6)]`}>
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
  const failedLabel = t("admin_dash_v4_load_failed");

  const [band, setBand] = useState<AdminDashboardBandTile[]>(initial?.band ?? []);
  const [tabData, setTabData] = useState<Partial<Record<AdminDashboardTabId, AdminDashboardTabData>>>(
    initial?.tabData ?? {}
  );
  const [generatedAt, setGeneratedAt] = useState<string | null>(initial?.generatedAt ?? null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const rangeRef = useRef<Partial<Record<AdminDashboardTabId, 7 | 30>>>({});
  const bandLoaded = useRef((initial?.band?.length ?? 0) > 0);

  const load = useCallback(async (target: AdminDashboardTabId, parts: string, range?: 7 | 30) => {
    const r = range ?? rangeRef.current[target] ?? 7;
    try {
      const res = await fetch(
        `/api/admin/dashboard/overview?tab=${encodeURIComponent(target)}&parts=${parts}&range=${r}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => null)) as AdminDashboardOverviewPayload | null;
      if (!res.ok || !json || json.ok !== true) throw new Error(`http_${res.status}`);
      setFetchFailed(false);
      setGeneratedAt(json.generatedAt);
      if (json.band) {
        bandLoaded.current = true;
        setBand((prev) => mergeAdminDashboardBand(prev, json.band ?? []));
      }
      setTabData((prev) => {
        const cur = prev[target] ?? EMPTY_TAB;
        const next: AdminDashboardTabData = { ...cur };
        if (json.metrics) next.metrics = mergeAdminDashboardMetrics(cur.metrics, json.metrics);
        if (json.domainCards) next.domainCards = mergeDomainCards(cur.domainCards, json.domainCards);
        if (json.shortcuts) next.shortcuts = json.shortcuts;
        if (json.trend) next.trend = mergeTrend(cur.trend, json.trend);
        if (json.pending) next.pending = cur.pending ? mergeAdminDashboardPending(cur.pending, json.pending) : json.pending;
        return { ...prev, [target]: next };
      });
    } catch {
      // 전체 요청 실패 — 이전 값을 그대로 두고 「불러오기 실패」만 표시 (0 으로 바꾸지 않는다)
      setFetchFailed(true);
      if (parts.includes("band")) {
        setBand((prev) =>
          prev.map((b) => ({ ...b, primary: markStale(b.primary), secondary: b.secondary ? markStale(b.secondary) : null }))
        );
      }
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

  // 탭 진입: 지표·추세·처리 대기 (+ 요약 띠 첫 1회)
  useEffect(() => {
    void load(tab, bandLoaded.current ? "metrics,trend,pending" : "band,metrics,trend,pending");
  }, [load, tab]);

  // 요약 띠·처리 대기 60초 자동 갱신 — 창이 숨겨지면 멈추고, 다시 보이면 즉시 갱신
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load(tab, "band,pending");
    };
    const id = window.setInterval(tick, ADMIN_DASHBOARD_REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(tab, "band,pending");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, tab]);

  const selectTab = useCallback(
    (next: AdminDashboardTabId) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === ADMIN_DASHBOARD_DEFAULT_TAB) sp.delete("tab");
      else sp.set("tab", next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const tabItems: AdminTabItem[] = useMemo(
    () =>
      ADMIN_DASHBOARD_TABS.map((d) => ({
        id: d.id,
        label: (
          <>
            <span className="hidden min-[1200px]:inline">{ko ? d.labelKo : d.labelEn}</span>
            <span className="min-[1200px]:hidden">{ko ? d.shortKo : d.shortEn}</span>
          </>
        ),
      })),
    [ko]
  );

  const data = tabData[tab] ?? EMPTY_TAB;
  const updated = generatedAt ? `${formatAdminManilaDateTime(generatedAt).slice(11)} PHT` : "—";

  return (
    <div data-admin-dashboard="v4" data-admin-dashboard-tab={tab} className="flex h-full min-h-0 flex-col">
      <h1 className="sr-only">{t("admin_menu_dashboard")}</h1>

      <section
        aria-label={t("admin_dash_v4_band_aria")}
        data-admin-dashboard-band="1"
        className="grid h-[72px] shrink-0 grid-cols-8 gap-2 min-[1200px]:h-20"
      >
        {band.map((b) => (
          <BandTileView key={b.id} tile={b} ko={ko} failedLabel={failedLabel} onSelectTab={selectTab} />
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
        <div className="grid h-full min-h-[420px] grid-cols-[minmax(0,1fr)_316px] gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_344px]">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <div className="grid shrink-0 grid-cols-3 gap-2" data-admin-dashboard-metrics="1">
              {data.metrics.map((m) => (
                <MetricTile key={m.id} m={m} ko={ko} failedLabel={failedLabel} />
              ))}
            </div>
            {data.domainCards.length ? (
              <div className="grid shrink-0 grid-cols-4 gap-2" data-admin-dashboard-domains="1">
                {data.domainCards.map((c) => (
                  <DomainCardView key={c.domain} c={c} ko={ko} t={t} failedLabel={failedLabel} />
                ))}
              </div>
            ) : null}
            <TrendView
              trend={data.trend}
              ko={ko}
              t={t}
              failedLabel={failedLabel}
              onRange={(r) => {
                rangeRef.current[tab] = r;
                void load(tab, "trend", r);
              }}
              onRefresh={() => void load(tab, "trend")}
            />
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
          <PendingView pending={data.pending} ko={ko} t={t} failedLabel={failedLabel} />
        </div>
      </div>

      <footer
        data-admin-dashboard-status="1"
        className={`mt-2 flex h-7 shrink-0 items-center gap-3 text-[12px] ${muted}`}
      >
        <span className="tabular-nums">{t("admin_dash_v4_updated", { time: updated })}</span>
        <span>· {t("admin_dash_v4_auto_refresh")}</span>
        {fetchFailed ? (
          <button type="button" className="text-sam-warning underline" onClick={() => void load(tab, "band,metrics,trend,pending")}>
            {failedLabel} · {t("admin_dash_v4_retry")}
          </button>
        ) : null}
        <span className="ml-auto">{t("admin_dash_v4_period_basis")}</span>
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

