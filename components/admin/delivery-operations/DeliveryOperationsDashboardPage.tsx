"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  parseDeliveryOperationsPayload,
  type DeliveryOperationsPayload,
} from "@/lib/admin-delivery-ops/delivery-operations-payload";
import { deliveryOpsStabilityPercent } from "@/lib/admin-delivery-ops/delivery-operations-health";
import { fetchAdminDeliveryOperationsDeduped } from "@/lib/admin/fetch-admin-delivery-operations-deduped";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { DeliveryOperationRecoveryAction } from "@/lib/admin/delivery-operation-recovery-actions";

type LoadState = "loading" | "ready" | "error";

const DAY_OPTIONS = [7, 14, 30] as const;

const CHART_SKELETON_ROWS = Array.from({ length: 12 }, (_, i) => ({
  label: "···",
  value: 0,
  hint: String(i),
}));

const QUEUE_META: { key: string; title: string }[] = [
  { key: "sla_attention", title: "SLA · 어텐션" },
  { key: "eta_overdue", title: "ETA 초과" },
  { key: "unassigned", title: "미배차" },
  { key: "long_delivering", title: "장기 delivering (45분+)" },
  { key: "held_settlements", title: "held 정산" },
  { key: "refund_requested", title: "환불 요청" },
  { key: "urgent_flagged", title: "긴급 플래그 주문" },
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

function fmtAgeSeconds(sec: unknown): string {
  const s = numMeta(sec);
  if (s <= 0) return "—";
  if (s >= 86400000) return "미수신";
  if (s < 90) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function healthBannerLabel(code: string): string {
  switch (code) {
    case "cron_heartbeat_stale":
      return "크론 하트비트가 오래되었거나 없습니다(약 5분 이상). pg_cron·배포 상태를 확인하세요.";
    case "failed_auto_action_backlog":
      return "실패한 자동 액션이 많습니다. 재시도·룰·외부 연동을 점검하세요.";
    case "pending_approval_backlog_high":
      return "승인 대기 자동 액션이 과다합니다.";
    case "stale_pending_approval":
      return "오래된 승인 대기(15분+)가 있습니다.";
    case "stuck_orders_detected":
      return "장기 waiting_rider 또는 장기 delivering 주문이 집계되었습니다.";
    case "held_settlement_stale":
      return "3일 이상 held 정산이 있습니다.";
    case "auto_actions_disabled":
      return "자동 액션 kill switch 가 OFF 입니다.";
    default:
      return code;
  }
}

const RECOVERY_BUTTONS: {
  action: DeliveryOperationRecoveryAction;
  label: string;
  hint: string;
}[] = [
  { action: "sla_scan", label: "SLA 스캔", hint: "scan_store_order_sla_warnings" },
  { action: "alert_sync", label: "알림 동기화", hint: "sync_delivery_operation_alert_events" },
  { action: "auto_action_runner", label: "자동 액션 러너", hint: "run_delivery_operation_alert_auto_actions" },
  { action: "alert_pipeline", label: "동기화+러너", hint: "수동 파이프라인 (기존 관리자 동기화와 동일 계열)" },
  {
    action: "stale_alerts_resolve",
    label: "종료 주문 알림 정리",
    hint: "완료·취소·환불 주문의 open 알림 → resolved (상한 220)",
  },
  {
    action: "waiting_rider_bump",
    label: "waiting_rider 재큐(소프트)",
    hint: "30분+ 대기 배차 행의 updated_at 만 갱신 (상한 120)",
  },
  {
    action: "delivering_mark_attention",
    label: "delivering 주목 표시",
    hint: "2시간+ delivering 에 needs_admin_attention (상한 120)",
  },
  {
    action: "bulk_retry_failed_auto_actions",
    label: "실패 자동 액션 재큐",
    hint: "retry RPC 최대 30건 (승인 필요 룰은 pending으로 복귀)",
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

function QueueRows({ qKey, rows }: { qKey: string; rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return <p className="sam-text-helper text-sam-muted">해당 없음</p>;
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
                  열기
                </Link>
              ) : null}
            </div>
            {storeName ? <p className="mt-0.5 truncate text-sam-muted sam-text-xxs">{storeName}</p> : null}
            {typeof row.order_status === "string" ? (
              <p className="text-sam-muted sam-text-xxs">상태 {row.order_status}</p>
            ) : null}
            {typeof row.sla_warning_level === "string" && row.sla_warning_level ? (
              <p className="text-sam-warning sam-text-xxs">SLA {row.sla_warning_level}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DeliveryOperationsDashboardPage() {
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
        setLastError(status === 503 ? "통계 함수 미배포(DB 마이그레이션 필요)" : `HTTP ${status}`);
      });
    },
    [days]
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
              : `실패 (${r.status})`
          );
          return;
        }
        setRecoveryNote(typeof j?.result === "string" ? String(j.result) : "ok");
        load({ showLoading: false });
      })
      .catch(() => {
        setRecoveryNote("네트워크 오류");
      })
      .finally(() => setRecoveryBusy(null));
  }, [load]);

  const loading = loadState === "loading";

  const hourRowsFilled = useMemo(() => {
    if (!payload) return [];
    return fillHours(payload.charts.orders_by_hour_utc).map((r) => ({
      label: `${String(r.hour).padStart(2, "0")}h`,
      value: r.count,
      hint: `UTC ${r.hour}시 · ${fmtInt(r.count)}건`,
    }));
  }, [payload]);

  const orderDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.orders_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.count,
      hint: `${d.date} · ${fmtInt(d.count)}건`,
    }));
  }, [payload]);

  const refundDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.refunds_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.amount,
      hint: `${d.date} · ${formatMoneyPhp(d.amount)}`,
    }));
  }, [payload]);

  const revenueDayBars = useMemo(() => {
    if (!payload) return [];
    return payload.charts.platform_revenue_by_day.map((d) => ({
      label: d.date.slice(5).replace("-", "/"),
      value: d.amount,
      hint: `${d.date} · ${formatMoneyPhp(d.amount)}`,
    }));
  }, [payload]);

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

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        title="배달 운영 통계"
        description="단일 RPC 집계 · 기간 필터 · 45초 자동 새로고침 · 시간대 차트는 UTC"
      />

      {payload?.health_rpc_missing ? (
        <div
          className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-4 py-3 sam-text-xxs text-sam-warning"
          role="status"
        >
          운영 헬스 RPC 미배포:{" "}
          <span className="font-mono text-[10px]">{payload.health_rpc_hint ?? "migration 필요"}</span>
        </div>
      ) : null}

      {payload?.health_rpc_error ? (
        <div
          className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-4 py-3 sam-text-xxs text-sam-warning"
          role="status"
        >
          헬스 RPC 오류: <span className="font-mono text-[10px]">{payload.health_rpc_error}</span>
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
              {healthBannerLabel(b)}
            </div>
          ))}
        </div>
      ) : null}

      {kpis ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-xxs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sam-fg">운영 헬스</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  verdict === "danger"
                    ? "bg-red-500/15 text-red-200"
                    : verdict === "warning"
                      ? "bg-sam-warning-soft text-sam-warning"
                      : "bg-sam-border/40 text-sam-fg"
                }`}
              >
                {verdict === "danger" ? "위험" : verdict === "warning" ? "주의" : "양호"}
              </span>
              <span className="text-sam-muted">
                안정성(휴리스틱) <strong className="tabular-nums text-sam-fg">{stabPct}%</strong>
              </span>
            </div>
            <Link href="/admin/delivery-auto-actions" className="text-signature underline">
              자동 액션 승인 대기
            </Link>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sam-muted">SLA cron 마지막</dt>
              <dd className="font-mono tabular-nums text-sam-fg">
                {fmtAgeSeconds(hbAgeObj?.sla_scan)}
                {health?.heartbeats?.sla_scan?.last_run_at ? (
                  <span className="ml-1 text-sam-muted">
                    ({health.heartbeats.sla_scan.last_run_at.slice(0, 19).replace("T", " ")})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">알림 동기화 마지막</dt>
              <dd className="font-mono tabular-nums text-sam-fg">{fmtAgeSeconds(hbAgeObj?.alert_sync)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">자동 액션 러너 마지막</dt>
              <dd className="font-mono tabular-nums text-sam-fg">{fmtAgeSeconds(hbAgeObj?.auto_action_runner)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">최근 실패 자동 액션</dt>
              <dd className="font-mono text-sam-fg">
                {typeof recentFail === "string" && recentFail
                  ? recentFail.slice(0, 19).replace("T", " ")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">승인 대기 / 15분+</dt>
              <dd className="tabular-nums text-sam-fg">
                {fmtInt(numMeta(health?.counts?.pending_approval_actions))} /{" "}
                {fmtInt(numMeta(health?.counts?.pending_approval_stale_15m))}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">실패 자동 액션(열린 건)</dt>
              <dd className="tabular-nums text-sam-fg">{fmtInt(numMeta(health?.counts?.failed_actions_open))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">stuck delivering (2h+)</dt>
              <dd className="tabular-nums text-sam-fg">{fmtInt(numMeta(health?.counts?.stuck_delivering_2h))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">stuck waiting_rider (30m+)</dt>
              <dd className="tabular-nums text-sam-fg">{fmtInt(numMeta(health?.counts?.stuck_waiting_rider_30m))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">held 정산 (전체 / 3일+)</dt>
              <dd className="tabular-nums text-sam-fg">
                {fmtInt(numMeta(health?.counts?.held_settlement_total))} /{" "}
                {fmtInt(numMeta(health?.counts?.held_settlement_older_than_3d))}
              </dd>
            </div>
          </dl>

          <details className="mt-3 border-t border-sam-border pt-3">
            <summary className="cursor-pointer font-medium text-sam-fg">복구 액션 (로그 기록)</summary>
            <p className="mt-2 text-sam-muted">
              동일 종류는 트랜잭션 락으로 동시 실행을 막습니다. 과도한 연속 클릭은 피하세요.
            </p>
            {recoveryNote ? (
              <p className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface-muted/40 px-2 py-1 font-mono text-[11px] text-sam-fg">
                {recoveryNote}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RECOVERY_BUTTONS.map((b) => (
                <div key={b.action} className="rounded-ui-rect border border-sam-border/80 bg-sam-app/30 p-2">
                  <button
                    type="button"
                    className="sam-btn sam-btn--outline sam-btn--sm w-full text-[11px]"
                    disabled={recoveryBusy !== null}
                    onClick={() => postRecovery(b.action)}
                  >
                    {recoveryBusy === b.action ? "실행 중…" : b.label}
                  </button>
                  <p className="mt-1 text-[10px] text-sam-muted">{b.hint}</p>
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
          <p className="font-medium">통계를 불러오지 못했습니다.</p>
          {lastError ? <p className="mt-1 text-sam-muted">{lastError}</p> : null}
          <button type="button" onClick={() => load({ showLoading: true })} className="sam-btn sam-btn--outline sam-btn--sm mt-3">
            다시 시도
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sam-text-helper text-sam-muted">기간</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`sam-btn sam-btn--sm ${days === d ? "sam-btn--primary" : "sam-btn--outline"}`}
            >
              {d}일
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {payload?.generated_at ? (
            <span className="sam-text-xxs text-sam-muted">
              생성 {payload.generated_at.slice(0, 19).replace("T", " ")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => load({ showLoading: true })}
            className="sam-btn sam-btn--outline sam-btn--sm"
            disabled={loading}
          >
            새로고침
          </button>
        </div>
      </div>

      <section aria-busy={loading ? true : undefined}>
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">운영 KPI</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "오늘 주문 수", value: kpis ? fmtInt(kpis.orders_today) : null },
            { label: "진행 중 주문", value: kpis ? fmtInt(kpis.orders_in_progress) : null },
            { label: "SLA 경고 수", value: kpis ? fmtInt(kpis.sla_attention_orders) : null },
            { label: "미배차 수", value: kpis ? fmtInt(kpis.unassigned_delivery_orders) : null },
            { label: "오늘 플랫폼 수익", value: kpis ? formatMoneyPhp(kpis.platform_revenue_today) : null },
            { label: "오늘 환불 금액", value: kpis ? formatMoneyPhp(kpis.refund_amount_today) : null },
            { label: "오늘 정산 예정금", value: kpis ? formatMoneyPhp(kpis.settlement_pending_amount_today) : null },
            { label: "온라인 라이더 수", value: kpis ? fmtInt(kpis.online_riders) : null },
          ].map((c) => (
            <div key={c.label} className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
              <p className="sam-text-helper text-sam-muted">{c.label}</p>
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
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">실시간 운영 큐</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {QUEUE_META.map(({ key, title }) => (
            <details
              key={key}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 open:border-signature/25"
              open={key === "sla_attention"}
            >
              <summary className="cursor-pointer list-none font-medium text-sam-fg [&::-webkit-details-marker]:hidden">
                {title}
                <span className="ml-2 text-sam-muted sam-text-helper">
                  {(payload?.queues[key]?.length ?? 0).toLocaleString()}건
                </span>
              </summary>
              <div className="mt-3 border-t border-sam-border pt-3">
                <QueueRows qKey={key} rows={payload?.queues[key] ?? []} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">추이 차트</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">일별 주문</h3>
            <MiniBarList rows={loading && !payload ? CHART_SKELETON_ROWS : orderDayBars} />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">시간대별 주문 (UTC)</h3>
            <MiniBarList rows={loading && !payload ? CHART_SKELETON_ROWS : hourRowsFilled} />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">환불 추이</h3>
            <MiniBarList
              rows={loading && !payload ? CHART_SKELETON_ROWS : refundDayBars}
              valueFmt={(n) => formatMoneyPhp(n)}
            />
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h3 className="mb-3 sam-text-body font-medium text-sam-fg">플랫폼 수익 추이</h3>
            <MiniBarList
              rows={loading && !payload ? CHART_SKELETON_ROWS : revenueDayBars}
              valueFmt={(n) => formatMoneyPhp(n)}
            />
          </div>
        </div>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">업체 TOP</h2>
        <table className="min-w-[720px] w-full border-collapse sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
              <th className="py-2 pr-3 font-medium">매장</th>
              <th className="py-2 pr-3 font-medium">주문</th>
              <th className="py-2 pr-3 font-medium">완료율</th>
              <th className="py-2 pr-3 font-medium">취소·환불율</th>
              <th className="py-2 pr-3 font-medium">환불 비율</th>
              <th className="py-2 pr-3 font-medium">SLA 플래그</th>
              <th className="py-2 pr-3 font-medium">매출</th>
              <th className="py-2 font-medium">플랫폼 수수료</th>
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
                  기간 내 데이터 없음
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">지역 TOP</h2>
        <table className="min-w-[520px] w-full border-collapse sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
              <th className="py-2 pr-3 font-medium">지역</th>
              <th className="py-2 pr-3 font-medium">주문</th>
              <th className="py-2 pr-3 font-medium">SLA 플래그</th>
              <th className="py-2 font-medium">매출</th>
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
                  기간 내 데이터 없음
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto">
        <h2 className="mb-3 sam-text-body font-medium text-sam-muted">라이더 TOP</h2>
        <table className="min-w-[640px] w-full border-collapse sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
              <th className="py-2 pr-3 font-medium">라이더 ID</th>
              <th className="py-2 pr-3 font-medium">완료 배달</th>
              <th className="py-2 pr-3 font-medium">평균 배달(분)</th>
              <th className="py-2 pr-3 font-medium">종료·실패 추정</th>
              <th className="py-2 font-medium">SLA 플래그</th>
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
                  기간 내 라이더 배달 기록 없음
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
