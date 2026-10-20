"use client";

/**
 * 배달 통계 (`/admin/delivery-operations`) — 읽기 전용 (DUP-2).
 * 일괄 복구·재배정 등 실시간 조치는 실시간 상황판(`/admin/ops-console`)에서만 한다.
 * 시간 표시는 Asia/Manila.
 */

import Link from "next/link";
import { useAdminAutoRefresh } from "@/lib/admin/use-admin-auto-refresh";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  parseDeliveryOperationsPayload,
  type DeliveryOperationsPayload,
} from "@/lib/admin-delivery-ops/delivery-operations-payload";
import { fetchAdminDeliveryOperationsDeduped } from "@/lib/admin/fetch-admin-delivery-operations-deduped";
import { invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminErrorState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDateTime, rebucketUtcHoursToManila } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

const HEALTH_NOT_READY_KO = "운영 상태 기능이 아직 준비되지 않았습니다. 시스템 관리자에게 문의하세요.";
const HEALTH_NOT_READY_EN = "The operations health feature is not ready yet. Contact a system admin.";

type LoadState = "loading" | "ready" | "error";
type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

const DAY_OPTIONS = [7, 14, 30] as const;

const CHART_SKELETON_ROWS = Array.from({ length: 12 }, (_, i) => ({
  label: "···",
  value: 0,
  hint: String(i),
}));

const QUEUE_META_KEYS: { key: string; titleKey: MessageKey }[] = [
  { key: "sla_attention", titleKey: "admin_del_ops_queue_sla_attention" },
  { key: "eta_overdue", titleKey: "admin_del_ops_queue_eta_overdue" },
  { key: "unassigned", titleKey: "admin_del_ops_queue_unassigned" },
  { key: "long_delivering", titleKey: "admin_del_ops_queue_long_delivering" },
  { key: "held_settlements", titleKey: "admin_del_ops_queue_held_settlements" },
  { key: "refund_requested", titleKey: "admin_del_ops_queue_refund_requested" },
  { key: "urgent_flagged", titleKey: "admin_del_ops_queue_urgent_flagged" },
];

function fmtInt(n: number): string {
  return Number.isFinite(n) ? formatAdminNumber(Math.round(n)) : "0";
}

function numMeta(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function fmtAgeSeconds(sec: unknown, noSignalLabel: string): string {
  const s = numMeta(sec);
  if (s <= 0) return "—";
  if (s >= 86400000) return noSignalLabel;
  if (s < 90) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function healthBannerKey(code: string): MessageKey | null {
  switch (code) {
    case "cron_heartbeat_stale":
      return "admin_del_ops_health_cron_stale";
    case "failed_auto_action_backlog":
      return "admin_del_ops_health_failed_backlog";
    case "pending_approval_backlog_high":
      return "admin_del_ops_health_pending_approval_high";
    case "stale_pending_approval":
      return "admin_del_ops_health_stale_pending";
    case "stuck_orders_detected":
      return "admin_del_ops_health_stuck_orders";
    case "held_settlement_stale":
      return "admin_del_ops_health_held_settlement_stale";
    case "auto_actions_disabled":
      return "admin_del_ops_health_auto_actions_disabled";
    default:
      return null;
  }
}

function healthBannerLabel(code: string, t: Translate): string {
  const key = healthBannerKey(code);
  return key ? t(key) : code;
}

function MiniBarList(props: {
  rows: { label: string; value: number; hint?: string }[];
  valueFmt?: (n: number) => string;
}) {
  const skeleton = props.rows.length > 0 && props.rows[0]?.label === "···";
  const maxVal = Math.max(1, ...props.rows.map((r) => r.value));
  const vf = props.valueFmt ?? fmtInt;
  return (
    <div className="space-y-2">
      {props.rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="flex items-center gap-2 sam-text-body-secondary">
          <span className="w-14 shrink-0 truncate text-sam-muted sm:w-20" title={r.label}>
            {r.label}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-sam-border/60">
              <div
                className={`h-full rounded bg-signature/35 ${skeleton ? "animate-pulse" : ""}`}
                style={{
                  width: skeleton ? "55%" : `${(r.value / maxVal) * 100}%`,
                  minWidth: skeleton || r.value > 0 ? "3px" : "0",
                }}
                title={r.hint ?? `${vf(r.value)}`}
              />
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-sam-fg">{vf(r.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function QueueRows({
  qKey,
  rows,
  t,
  ko,
}: {
  qKey: string;
  rows: Record<string, unknown>[];
  t: Translate;
  ko: boolean;
}) {
  if (!rows.length) {
    return <p className="sam-text-helper text-sam-muted">{t("admin_del_ops_queue_none")}</p>;
  }
  return (
    <ul className="max-h-52 space-y-2 overflow-y-auto pr-1 sam-text-body-secondary">
      {rows.map((row, idx) => {
        const orderId = typeof row.order_id === "string" ? row.order_id : "";
        const settlementId = typeof row.settlement_id === "string" ? row.settlement_id : "";
        const orderNo = typeof row.order_no === "string" ? row.order_no : "";
        const storeName = typeof row.store_name === "string" ? row.store_name : "";
        const primary = orderNo || `#${idx + 1}`;
        const href =
          qKey === "held_settlements" && settlementId
            ? `/admin/store-settlements`
            : orderId
              ? `/admin/stores/orders/${encodeURIComponent(orderId)}`
              : null;
        return (
          <li key={`${orderId || settlementId}-${idx}`} className="rounded-ui-rect border border-sam-border/80 bg-sam-surface-muted/40 px-2 py-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-sam-fg">{primary}</span>
              {href ? (
                <Link href={href} className="text-signature underline sam-text-xxs">
                  {t("admin_del_ops_open")}
                </Link>
              ) : null}
            </div>
            {storeName ? <p className="mt-0.5 truncate text-sam-muted sam-text-xxs">{storeName}</p> : null}
            {typeof row.order_status === "string" ? (
              <p className="text-sam-muted sam-text-xxs">
                {t("admin_del_ops_status_label", { status: adminStatusLabel("store_order", row.order_status, ko).label })}
              </p>
            ) : null}
            {typeof row.sla_warning_level === "string" && row.sla_warning_level ? (
              <p className="text-sam-warning sam-text-xxs">
                {t("admin_del_ops_sla_label", {
                  level: adminStatusLabel("alert_severity", row.sla_warning_level, ko).label,
                })}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DeliveryOperationsDashboardPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const noSignalLabel = t("admin_del_ops_age_no_signal");

  const [days, setDays] = useState<number>(14);
  const [payload, setPayload] = useState<DeliveryOperationsPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  /** 불러오기 실패 — 코드·HTTP 상태 (AdminErrorState: 403 은 권한 없음, 나머지 오류 맵 + [새로고침]). */
  const [lastError, setLastError] = useState<{ code: string; status: number } | null>(null);

  const load = useCallback(
    (opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading ?? false;
      if (showLoading) {
        setLoadState("loading");
        // 수동 새로고침·기간 변경은 30초 GET 캐시를 건너뛰고 서버에서 다시 읽는다.
        invalidateAdminFetchCache(`admin:stats:delivery-operations:${Math.min(90, Math.max(1, Math.floor(days)))}`);
      }
      void fetchAdminDeliveryOperationsDeduped(days).then(({ status, json }) => {
        const parsed = parseDeliveryOperationsPayload(json);
        if (status === 200 && parsed) {
          setPayload(parsed);
          setLoadState("ready");
          setLastError(null);
          return;
        }
        // 실패해도 직전 집계는 지우지 않는다 (§8-5) — 권한 없음만 비운다.
        if (status === 403) setPayload(null);
        setLoadState("error");
        const rawErr =
          json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
            ? String((json as { error: string }).error)
            : "";
        const code = /^[a-z][a-z0-9_]*$/i.test(rawErr) ? rawErr : "";
        setLastError({ code: status === 403 ? code || "forbidden" : code || "load_failed", status });
      });
    },
    [days]
  );

  useEffect(() => {
    load({ showLoading: true });
  }, [load]);

  // 60초 자동 갱신 (대시보드 기본 주기) — 탭이 숨겨지면 멈춤 · 이전 조회가 끝나지 않았으면 건너뜀
  const autoRefresh = useCallback(() => load({ showLoading: false }), [load]);
  useAdminAutoRefresh(autoRefresh, { intervalMs: 60_000 });

  const loading = loadState === "loading";

  const hourRowsFilled = useMemo(() => {
    if (!payload) return [];
    return rebucketUtcHoursToManila(payload.charts.orders_by_hour_utc).map((r) => ({
      label: `${String(r.hour).padStart(2, "0")}h`,
      value: r.count,
      hint: t("admin_del_ops_chart_hint_hour", { hour: r.hour, count: fmtInt(r.count) }),
    }));
  }, [payload, t]);

  const orderDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.orders_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.count,
      hint: t("admin_del_ops_chart_hint_day_count", { date: d.date, count: fmtInt(d.count) }),
    }));
  }, [payload, t]);

  const refundDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.refunds_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.amount,
      hint: t("admin_del_ops_chart_hint_day_amount", { date: d.date, amount: formatAdminPhp(d.amount) }),
    }));
  }, [payload, t]);

  const revenueDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.platform_revenue_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.amount,
      hint: t("admin_del_ops_chart_hint_day_amount", { date: d.date, amount: formatAdminPhp(d.amount) }),
    }));
  }, [payload, t]);

  const kpis = payload?.kpis;
  const health = payload?.health;
  const verdict = health?.verdict?.overall ?? "";
  const hbAge = health?.counts?.heartbeat_age_seconds;
  const hbAgeObj =
    hbAge != null && typeof hbAge === "object" && !Array.isArray(hbAge)
      ? (hbAge as Record<string, unknown>)
      : null;
  const recentFail = health?.counts?.recent_failed_action_at;

  const verdictLabel =
    verdict === "danger"
      ? t("admin_del_ops_verdict_danger")
      : verdict === "warning"
        ? t("admin_del_ops_verdict_warning")
        : t("admin_del_ops_verdict_ok");

  const kpiCards: { labelKey: MessageKey; value: string | null }[] = [
    { labelKey: "admin_del_ops_kpi_orders_today", value: kpis ? fmtInt(kpis.orders_today) : null },
    { labelKey: "admin_del_ops_kpi_in_progress", value: kpis ? fmtInt(kpis.orders_in_progress) : null },
    { labelKey: "admin_del_ops_kpi_sla_attention", value: kpis ? fmtInt(kpis.sla_attention_orders) : null },
    { labelKey: "admin_del_ops_kpi_unassigned", value: kpis ? fmtInt(kpis.unassigned_delivery_orders) : null },
    {
      labelKey: "admin_del_ops_kpi_revenue_today",
      value: kpis?.platform_revenue_today != null ? formatAdminPhp(kpis.platform_revenue_today) : null,
    },
    { labelKey: "admin_del_ops_kpi_refund_today", value: kpis ? formatAdminPhp(kpis.refund_amount_today) : null },
    {
      labelKey: "admin_del_ops_kpi_settlement_today",
      value: kpis?.settlement_pending_amount_today != null ? formatAdminPhp(kpis.settlement_pending_amount_today) : null,
    },
    { labelKey: "admin_del_ops_kpi_online_riders", value: kpis ? fmtInt(kpis.online_riders) : null },
  ];

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        titleKey="admin_menu_delivery_operations_stats"
        descriptionKey="admin_del_ops_page_desc"
      />

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted"
        data-delivery-stats-readonly="1"
      >
        <span>{t("admin_r4d_stats_readonly")}</span>
        <Link href="/admin/ops-console" className="sam-btn sam-btn--outline sam-btn--sm">
          {t("admin_r4d_stats_open_console")}
        </Link>
      </div>

      {payload?.health_rpc_missing ? (
        <div
          className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-4 py-3 sam-text-xxs text-sam-warning"
          role="status"
        >
          {ko ? HEALTH_NOT_READY_KO : HEALTH_NOT_READY_EN}
          {payload.health_rpc_hint ? <AdminTechDetails ko={ko}>{payload.health_rpc_hint}</AdminTechDetails> : null}
        </div>
      ) : null}

      {payload?.health_rpc_error ? (
        <div
          className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-4 py-3 sam-text-xxs text-sam-warning"
          role="status"
        >
          {ko ? HEALTH_NOT_READY_KO : HEALTH_NOT_READY_EN}
          <AdminTechDetails ko={ko}>{payload.health_rpc_error}</AdminTechDetails>
        </div>
      ) : null}

      {health?.banners?.length ? (
        <div className="space-y-2">
          {health.banners.map((b) => (
            <div
              key={b}
              className={`rounded-ui-rect border px-3 py-2 sam-text-xxs ${
                verdict === "danger"
                  ? "border-sam-danger/30 bg-sam-danger-soft text-sam-danger"
                  : verdict === "warning"
                    ? "border-sam-warning/25 bg-sam-warning-soft text-sam-warning"
                    : "border-sam-border bg-sam-surface text-sam-muted"
              }`}
            >
              {healthBannerLabel(b, t)}
            </div>
          ))}
        </div>
      ) : null}

      {kpis ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-xxs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sam-fg">{t("admin_del_ops_section_health")}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  verdict === "danger"
                    ? "bg-sam-danger-soft text-sam-danger"
                    : verdict === "warning"
                      ? "bg-sam-warning-soft text-sam-warning"
                      : "bg-sam-border/40 text-sam-fg"
                }`}
              >
                {verdictLabel}
              </span>
            </div>
            <Link href="/admin/delivery-auto-actions" className="text-signature underline">
              {t("admin_del_ops_link_auto_actions_pending")}
            </Link>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_hb_sla_cron_last")}</dt>
              <dd className="font-mono tabular-nums text-sam-fg">
                {fmtAgeSeconds(hbAgeObj?.sla_scan, noSignalLabel)}
                {health?.heartbeats?.sla_scan?.last_run_at ? (
                  <span className="ml-1 text-sam-muted">
                    ({formatAdminManilaDateTime(health.heartbeats.sla_scan.last_run_at)})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_hb_alert_sync_last")}</dt>
              <dd className="font-mono tabular-nums text-sam-fg">
                {fmtAgeSeconds(hbAgeObj?.alert_sync, noSignalLabel)}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_hb_auto_runner_last")}</dt>
              <dd className="font-mono tabular-nums text-sam-fg">
                {fmtAgeSeconds(hbAgeObj?.auto_action_runner, noSignalLabel)}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_recent_failed_auto")}</dt>
              <dd className="font-mono text-sam-fg">
                {typeof recentFail === "string" && recentFail ? formatAdminManilaDateTime(recentFail) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_pending_approval_counts")}</dt>
              <dd className="tabular-nums text-sam-fg">
                {fmtInt(numMeta(health?.counts?.pending_approval_actions))} /{" "}
                {fmtInt(numMeta(health?.counts?.pending_approval_stale_15m))}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_failed_actions_open")}</dt>
              <dd className="tabular-nums text-sam-fg">{fmtInt(numMeta(health?.counts?.failed_actions_open))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_stuck_delivering")}</dt>
              <dd className="tabular-nums text-sam-fg">{fmtInt(numMeta(health?.counts?.stuck_delivering_2h))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_stuck_waiting_rider")}</dt>
              <dd className="tabular-nums text-sam-fg">{fmtInt(numMeta(health?.counts?.stuck_waiting_rider_30m))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_del_ops_held_settlement_counts")}</dt>
              <dd className="tabular-nums text-sam-fg">
                {fmtInt(numMeta(health?.counts?.held_settlement_total))} /{" "}
                {fmtInt(numMeta(health?.counts?.held_settlement_older_than_3d))}
              </dd>
            </div>
          </dl>

        </section>
      ) : null}

      {loadState === "error" && lastError?.status === 503 ? (
        // 집계 함수 미적용(준비 중) — 오류가 아니라 준비 상태 안내
        <div
          className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-warning"
          role="status"
        >
          <p className="font-medium">{t("admin_del_ops_load_failed_title")}</p>
          <p className="mt-1 text-sam-muted">{ko ? HEALTH_NOT_READY_KO : HEALTH_NOT_READY_EN}</p>
        </div>
      ) : loadState === "error" && lastError ? (
        <AdminErrorState ko={ko} code={lastError.code} httpStatus={lastError.status} onRetry={() => load({ showLoading: true })} />
      ) : null}


      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sam-text-helper text-sam-muted">{t("admin_del_ops_period_label")}</span>
          {DAY_OPTIONS.map((d) => (
            <AdminChipButton
              key={d}
              type="button"
              onClick={() => setDays(d)}
              selected={days === d}
            >
              {t("admin_del_ops_days", { days: d })}
            </AdminChipButton>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {payload?.generated_at ? (
            <span className="sam-text-xxs text-sam-muted">
              {t("admin_r4d_generated_at", { at: formatAdminManilaDateTime(payload.generated_at) })}
            </span>
          ) : null}
          <AdminActionButton
            type="button"
            onClick={() => load({ showLoading: true })}
            variant="secondary" size="sm"
            disabled={loading}
          >
            {t("admin_do_common_refresh")}
          </AdminActionButton>
        </div>
      </div>

      <section aria-busy={loading ? true : undefined}>
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_kpi")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiCards.map((c) => (
            <div key={c.labelKey} className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
              <p className="sam-text-helper text-sam-muted">{t(c.labelKey)}</p>
              <p className="mt-1 sam-text-page-title font-semibold tabular-nums text-sam-fg">
                {loading && !kpis ? (
                  <span className="inline-block h-[1.125rem] w-[4rem] animate-pulse rounded bg-sam-border" aria-hidden />
                ) : (
                  (c.value ?? t("admin_r4d_unavailable"))
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_queues")}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {QUEUE_META_KEYS.map(({ key, titleKey }) => (
            <details
              key={key}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 open:border-signature/25"
              open={key === "sla_attention"}
            >
              <summary className="cursor-pointer list-none font-medium text-sam-fg [&::-webkit-details-marker]:hidden">
                {t(titleKey)}
                <span className="ml-2 text-sam-muted sam-text-helper">
                  {t("admin_do_common_count_unit", { count: payload?.queues[key]?.length ?? 0 })}
                </span>
              </summary>
              <div className="mt-3 border-t border-sam-border pt-3">
                <QueueRows qKey={key} rows={payload?.queues[key] ?? []} t={t} ko={ko} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_charts")}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-1 sam-text-body font-medium text-sam-fg">{t("admin_del_ops_chart_orders_by_day")}</h3>
            <p className="mb-3 sam-text-xxs text-sam-muted">{t("admin_r4d_stats_day_basis")}</p>
            <MiniBarList rows={loading && !payload ? CHART_SKELETON_ROWS : orderDayBars} />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_ops_chart_orders_by_hour")}</h3>
            <MiniBarList rows={loading && !payload ? CHART_SKELETON_ROWS : hourRowsFilled} />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_ops_chart_refunds")}</h3>
            <MiniBarList
              rows={loading && !payload ? CHART_SKELETON_ROWS : refundDayBars}
              valueFmt={(n) => formatAdminPhp(n)}
            />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_ops_chart_revenue")}</h3>
            <MiniBarList
              rows={loading && !payload ? CHART_SKELETON_ROWS : revenueDayBars}
              valueFmt={(n) => formatAdminPhp(n)}
            />
          </div>
        </div>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_top_stores")}</h2>
        <table className="min-w-[720px] w-full border-collapse sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
              <th className="py-2 pr-3 font-medium">{t("admin_do_th_store")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_do_common_order")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_completion_rate")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_cancel_refund_rate")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_refund_rate")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_sla_flags")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_gross")}</th>
              <th className="py-2 font-medium">{t("admin_del_ops_th_platform_fees")}</th>
            </tr>
          </thead>
          <tbody>
            {(payload?.charts.top_stores ?? []).map((row, idx) => {
              const orders = Number(row.orders ?? 0);
              const completed = Number(row.completed ?? 0);
              const bad = Number(row.cancelled_or_refunded ?? 0);
              const refunds = Number(row.refund_orders ?? 0);
              const gross = Number(row.gross ?? 0);
              const fees = Number(row.platform_fees ?? 0);
              const sla = Number(row.sla_flags ?? 0);
              const name = String(row.store_name ?? "");
              const storeId = String(row.store_id ?? "");
              const rate = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
              return (
                <tr key={`${storeId}-${idx}`} className="border-b border-sam-border/70">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-sam-fg">{name || t("admin_r4d_store_unnamed")}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmtInt(orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{rate(completed, orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{rate(bad, orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{rate(refunds, orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtInt(sla)}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatAdminPhp(gross)}</td>
                  <td className="py-2 tabular-nums">{formatAdminPhp(fees)}</td>
                </tr>
              );
            })}
            {!loading && (payload?.charts.top_stores.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sam-muted">
                  {t("admin_del_ops_no_data_in_period")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_top_regions")}</h2>
        <table className="min-w-[520px] w-full border-collapse sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_region")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_do_common_order")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_sla_flags")}</th>
              <th className="py-2 font-medium">{t("admin_del_ops_th_gross")}</th>
            </tr>
          </thead>
          <tbody>
            {(payload?.charts.top_regions ?? []).map((row, idx) => (
              <tr key={`${String(row.region_key)}-${idx}`} className="border-b border-sam-border/70">
                <td className="py-2 pr-3 font-medium text-sam-fg">{String(row.region_key ?? "")}</td>
                <td className="py-2 pr-3 tabular-nums">{fmtInt(Number(row.orders ?? 0))}</td>
                <td className="py-2 pr-3 tabular-nums">{fmtInt(Number(row.sla_flags ?? 0))}</td>
                <td className="py-2 tabular-nums">{formatAdminPhp(Number(row.gross ?? 0))}</td>
              </tr>
            ))}
            {!loading && (payload?.charts.top_regions.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sam-muted">
                  {t("admin_del_ops_no_data_in_period")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_top_riders")}</h2>
        <table className="min-w-[640px] w-full border-collapse sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_rider_id")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_completed_deliveries")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_avg_delivery_min")}</th>
              <th className="py-2 pr-3 font-medium">{t("admin_del_ops_th_terminal_estimate")}</th>
              <th className="py-2 font-medium">{t("admin_del_ops_th_sla_flags")}</th>
            </tr>
          </thead>
          <tbody>
            {(payload?.riders ?? []).map((r, idx) => (
              <tr key={`${r.rider_id}-${idx}`} className="border-b border-sam-border/70">
                <td className="py-2 pr-3 text-xs text-sam-fg">
                  {t("admin_r4d_rider_unnamed")} #{idx + 1}
                  <AdminTechDetails ko={ko}>{r.rider_id}</AdminTechDetails>
                </td>
                <td className="py-2 pr-3 tabular-nums">{fmtInt(r.completed_deliveries)}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {r.avg_delivery_minutes != null ? r.avg_delivery_minutes.toFixed(1) : "—"}
                </td>
                <td className="py-2 pr-3 tabular-nums">{fmtInt(r.failed_or_terminal_orders)}</td>
                <td className="py-2 tabular-nums">{fmtInt(r.sla_flags)}</td>
              </tr>
            ))}
            {!loading && (payload?.riders.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sam-muted">
                  {t("admin_del_ops_no_rider_records")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
