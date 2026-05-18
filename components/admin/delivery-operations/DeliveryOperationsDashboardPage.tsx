"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  parseDeliveryOperationsPayload,
  type DeliveryOperationsPayload,
} from "@/lib/admin-delivery-ops/delivery-operations-payload";
import { deliveryOpsStabilityPercent } from "@/lib/admin-delivery-ops/delivery-operations-health";
import { fetchAdminDeliveryOperationsDeduped } from "@/lib/admin/fetch-admin-delivery-operations-deduped";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { DeliveryOperationRecoveryAction } from "@/lib/admin/delivery-operation-recovery-actions";
import type { MessageKey } from "@/lib/i18n/messages";

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
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";
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

const RECOVERY_BUTTON_KEYS: {
  action: DeliveryOperationRecoveryAction;
  labelKey: MessageKey;
  hintKey: MessageKey;
}[] = [
  {
    action: "sla_scan",
    labelKey: "admin_del_ops_recovery_sla_scan",
    hintKey: "admin_del_ops_recovery_hint_sla_scan",
  },
  {
    action: "alert_sync",
    labelKey: "admin_del_ops_recovery_alert_sync",
    hintKey: "admin_del_ops_recovery_hint_alert_sync",
  },
  {
    action: "auto_action_runner",
    labelKey: "admin_del_ops_recovery_auto_runner",
    hintKey: "admin_del_ops_recovery_hint_auto_runner",
  },
  {
    action: "alert_pipeline",
    labelKey: "admin_del_ops_recovery_pipeline",
    hintKey: "admin_del_ops_recovery_hint_pipeline",
  },
  {
    action: "stale_alerts_resolve",
    labelKey: "admin_del_ops_recovery_stale_alerts",
    hintKey: "admin_del_ops_recovery_hint_stale_alerts",
  },
  {
    action: "waiting_rider_bump",
    labelKey: "admin_del_ops_recovery_waiting_bump",
    hintKey: "admin_del_ops_recovery_hint_waiting_bump",
  },
  {
    action: "delivering_mark_attention",
    labelKey: "admin_del_ops_recovery_delivering_attention",
    hintKey: "admin_del_ops_recovery_hint_delivering_attention",
  },
  {
    action: "bulk_retry_failed_auto_actions",
    labelKey: "admin_del_ops_recovery_bulk_retry",
    hintKey: "admin_del_ops_recovery_hint_bulk_retry",
  },
];

function fillHours(rows: { hour: number; count: number }[]): { hour: number; count: number }[] {
  const m = new Map(rows.map((r) => [r.hour, r.count]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: m.get(h) ?? 0 }));
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
}: {
  qKey: string;
  rows: Record<string, unknown>[];
  t: Translate;
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
        const primary = orderNo || orderId.slice(0, 8) || settlementId.slice(0, 8) || `#${idx + 1}`;
        const href =
          qKey === "held_settlements" && settlementId
            ? `/admin/store-settlements`
            : orderId
              ? `/admin/store-orders?order_id=${encodeURIComponent(orderId)}`
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
                {t("admin_del_ops_status_label", { status: row.order_status })}
              </p>
            ) : null}
            {typeof row.sla_warning_level === "string" && row.sla_warning_level ? (
              <p className="text-sam-warning sam-text-xxs">
                {t("admin_del_ops_sla_label", { level: row.sla_warning_level })}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DeliveryOperationsDashboardPage() {
  const { t } = useI18n();
  const noSignalLabel = t("admin_del_ops_age_no_signal");

  const [days, setDays] = useState<number>(14);
  const [payload, setPayload] = useState<DeliveryOperationsPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [lastError, setLastError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState<DeliveryOperationRecoveryAction | null>(null);
  const [recoveryNote, setRecoveryNote] = useState<string | null>(null);

  const load = useCallback(
    (opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading ?? false;
      if (showLoading) setLoadState("loading");
      void fetchAdminDeliveryOperationsDeduped(days).then(({ status, json }) => {
        const parsed = parseDeliveryOperationsPayload(json);
        if (status === 200 && parsed) {
          setPayload(parsed);
          setLoadState("ready");
          setLastError(null);
          return;
        }
        setPayload(null);
        setLoadState("error");
        setLastError(
          status === 503
            ? t("admin_del_ops_err_stats_fn_missing")
            : t("admin_del_ops_err_http", { status })
        );
      });
    },
    [days, t]
  );

  useEffect(() => {
    load({ showLoading: true });
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => load({ showLoading: false }), 45_000);
    return () => window.clearInterval(id);
  }, [load]);

  const postRecovery = useCallback((action: DeliveryOperationRecoveryAction) => {
    setRecoveryBusy(action);
    setRecoveryNote(null);
    void fetch("/api/admin/delivery-operations/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setRecoveryNote(
            j && typeof j === "object" && j != null && "message" in j
              ? String((j as { message?: unknown }).message)
              : t("admin_del_ops_fail_status", { status: r.status })
          );
          return;
        }
        setRecoveryNote(typeof j?.result === "string" ? String(j.result) : t("admin_del_ops_ok"));
        load({ showLoading: false });
      })
      .catch(() => {
        setRecoveryNote(t("common_network_error"));
      })
      .finally(() => setRecoveryBusy(null));
  }, [load, t]);

  const loading = loadState === "loading";

  const hourRowsFilled = useMemo(() => {
    if (!payload) return [];
    return fillHours(payload.charts.orders_by_hour_utc).map((r) => ({
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
      hint: t("admin_del_ops_chart_hint_day_amount", { date: d.date, amount: formatMoneyPhp(d.amount) }),
    }));
  }, [payload, t]);

  const revenueDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.platform_revenue_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.amount,
      hint: t("admin_del_ops_chart_hint_day_amount", { date: d.date, amount: formatMoneyPhp(d.amount) }),
    }));
  }, [payload, t]);

  const kpis = payload?.kpis;
  const health = payload?.health;
  const verdict = health?.verdict?.overall ?? "";
  const stabPct = deliveryOpsStabilityPercent(health ?? null);
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
      value: kpis ? formatMoneyPhp(kpis.platform_revenue_today) : null,
    },
    { labelKey: "admin_del_ops_kpi_refund_today", value: kpis ? formatMoneyPhp(kpis.refund_amount_today) : null },
    {
      labelKey: "admin_del_ops_kpi_settlement_today",
      value: kpis ? formatMoneyPhp(kpis.settlement_pending_amount_today) : null,
    },
    { labelKey: "admin_del_ops_kpi_online_riders", value: kpis ? fmtInt(kpis.online_riders) : null },
  ];

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        titleKey="admin_menu_delivery_operations_stats"
        descriptionKey="admin_del_ops_page_desc"
      />

      {payload?.health_rpc_missing ? (
        <div
          className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-4 py-3 sam-text-xxs text-sam-warning"
          role="status"
        >
          {t("admin_del_ops_health_rpc_missing")}{" "}
          <span className="font-mono text-[10px]">
            {payload.health_rpc_hint ?? t("admin_del_ops_migration_needed")}
          </span>
        </div>
      ) : null}

      {payload?.health_rpc_error ? (
        <div
          className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-4 py-3 sam-text-xxs text-sam-warning"
          role="status"
        >
          {t("admin_del_ops_health_rpc_error")}{" "}
          <span className="font-mono text-[10px]">{payload.health_rpc_error}</span>
        </div>
      ) : null}

      {health?.banners?.length ? (
        <div className="space-y-2">
          {health.banners.map((b) => (
            <div
              key={b}
              className={`rounded-ui-rect border px-3 py-2 sam-text-xxs ${
                verdict === "danger"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
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
                    ? "bg-red-500/15 text-red-200"
                    : verdict === "warning"
                      ? "bg-sam-warning-soft text-sam-warning"
                      : "bg-sam-border/40 text-sam-fg"
                }`}
              >
                {verdictLabel}
              </span>
              <span className="text-sam-muted">
                {t("admin_del_ops_stability_label")}{" "}
                <strong className="tabular-nums text-sam-fg">{stabPct}%</strong>
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
                    ({health.heartbeats.sla_scan.last_run_at.slice(0, 19).replace("T", " ")})
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
                {typeof recentFail === "string" && recentFail
                  ? recentFail.slice(0, 19).replace("T", " ")
                  : "—"}
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

          <details className="mt-3 border-t border-sam-border pt-3">
            <summary className="cursor-pointer font-medium text-sam-fg">
              {t("admin_del_ops_recovery_summary")}
            </summary>
            <p className="mt-2 text-sam-muted">{t("admin_del_ops_recovery_hint")}</p>
            {recoveryNote ? (
              <p className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface-muted/40 px-2 py-1 font-mono text-[11px] text-sam-fg">
                {recoveryNote}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RECOVERY_BUTTON_KEYS.map((b) => (
                <div key={b.action} className="rounded-ui-rect border border-sam-border/80 bg-sam-app/30 p-2">
                  <button
                    type="button"
                    className="sam-btn sam-btn--outline sam-btn--sm w-full text-[11px]"
                    disabled={recoveryBusy !== null}
                    onClick={() => postRecovery(b.action)}
                  >
                    {recoveryBusy === b.action ? t("admin_del_ops_recovery_running") : t(b.labelKey)}
                  </button>
                  <p className="mt-1 text-[10px] text-sam-muted">{t(b.hintKey)}</p>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      {loadState === "error" && (
        <div
          className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-warning"
          role="alert"
        >
          <p className="font-medium">{t("admin_del_ops_load_failed_title")}</p>
          {lastError ? <p className="mt-1 text-sam-muted">{lastError}</p> : null}
          <button type="button" onClick={() => load({ showLoading: true })} className="sam-btn sam-btn--outline sam-btn--sm mt-3">
            {t("common_retry")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sam-text-helper text-sam-muted">{t("admin_del_ops_period_label")}</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`sam-btn sam-btn--sm ${days === d ? "sam-btn--primary" : "sam-btn--outline"}`}
            >
              {t("admin_del_ops_days", { days: d })}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {payload?.generated_at ? (
            <span className="sam-text-xxs text-sam-muted">
              {t("admin_del_ops_generated_at", {
                at: payload.generated_at.slice(0, 19).replace("T", " "),
              })}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => load({ showLoading: true })}
            className="sam-btn sam-btn--outline sam-btn--sm"
            disabled={loading}
          >
            {t("admin_do_common_refresh")}
          </button>
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
                  (c.value ?? "—")
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
                <QueueRows qKey={key} rows={payload?.queues[key] ?? []} t={t} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">{t("admin_del_ops_section_charts")}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_ops_chart_orders_by_day")}</h3>
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
              valueFmt={(n) => formatMoneyPhp(n)}
            />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_ops_chart_revenue")}</h3>
            <MiniBarList
              rows={loading && !payload ? CHART_SKELETON_ROWS : revenueDayBars}
              valueFmt={(n) => formatMoneyPhp(n)}
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
                    <span className="font-medium text-sam-fg">{name || storeId.slice(0, 8)}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmtInt(orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{rate(completed, orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{rate(bad, orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{rate(refunds, orders)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtInt(sla)}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatMoneyPhp(gross)}</td>
                  <td className="py-2 tabular-nums">{formatMoneyPhp(fees)}</td>
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
                <td className="py-2 tabular-nums">{formatMoneyPhp(Number(row.gross ?? 0))}</td>
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
                <td className="py-2 pr-3 font-mono text-xs text-sam-fg">{r.rider_id.slice(0, 8)}…</td>
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
