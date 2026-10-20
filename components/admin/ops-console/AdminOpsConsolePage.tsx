"use client";

/**
 * 실시간 상황판 (`/admin/ops-console`) — DUP-2: 실시간 조치(일괄 복구 L3 · 라이더 재배정 L2 ·
 * 배정 해제 · 주의 표시)만 이 화면에서 한다. 경고 처리 → 배달 경고, 자동 조치 승인/거절/재실행 →
 * 자동 조치 승인 화면으로 **링크만** 둔다. 통계는 배달 통계(읽기 전용).
 */

import Link from "next/link";
import { useAdminAutoRefresh } from "@/lib/admin/use-admin-auto-refresh";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { Sam } from "@/lib/ui/sam-component-classes";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import {
  parseDeliveryOperationsPayload,
  type DeliveryOperationsPayload,
} from "@/lib/admin-delivery-ops/delivery-operations-payload";
import type { DeliveryOperationRecoveryAction } from "@/lib/admin/delivery-operation-recovery-actions";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { getDeliveryMetricDefinition } from "@/lib/admin/metrics/delivery-metrics";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";

/** API 응답에서 운영자 오류 코드만 추출 (원시 HTTP 상태·메시지 노출 금지). */
function apiErrorCode(status: number, j: unknown, fallback: string): string {
  const e = j != null && typeof j === "object" ? (j as { error?: unknown }).error : undefined;
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

type PrevNoteState =
  | { state: "loading" }
  | { state: "ready"; note: string; updatedAt: string | null }
  | { state: "error" };

type OpsConsoleSummary = {
  ok?: boolean;
  error?: string;
  hint?: string;
  generated_at?: string;
  deliveryOps?: unknown;
  kpi?: {
    failed_auto_actions?: number;
    pending_approvals?: number;
  };
  runtime?: {
    warnings?: { code: string; message: string }[];
  };
  viewer_admin_id?: string;
};

type ResultState = { ok: true; message: string } | { ok: false; code: string } | null;

const TABS = [
  { key: "risk", labelKey: "admin_ops_console_tab_risk" },
  { key: "sla", labelKey: "admin_ops_console_tab_sla" },
  { key: "riders", labelKey: "admin_ops_console_tab_riders" },
  { key: "settlements", labelKey: "admin_ops_console_tab_settlements" },
  { key: "incidents", labelKey: "admin_ops_console_tab_incidents" },
] as const satisfies readonly { key: string; labelKey: MessageKey }[];

type TabKey = (typeof TABS)[number]["key"];

/**
 * 탭별 큐 출처 (참고 — 실제 합치기·중복 제거·우선순위·페이지는 DB `admin_ops_console_queue_page`):
 * risk = urgent_flagged·sla_attention·eta_overdue·long_delivering·unassigned · sla = sla_attention·eta_overdue ·
 * riders = unassigned·long_delivering · settlements = held_settlements·refund_requested · incidents = sla_attention
 */
type QueueRow = Record<string, unknown>;

type QueuePayload = {
  ok?: boolean;
  error?: string;
  rows?: QueueRow[];
  total?: number;
  tab_counts?: Partial<Record<TabKey, number>>;
  queue_counts?: Record<string, number>;
};

/** 현장 일괄 복구 — 자동 조치 관련 일괄 작업은 자동 조치 승인 화면에 있다 (DUP-2). */
const QUICK_RECOVERY: { action: DeliveryOperationRecoveryAction; labelKey: MessageKey }[] = [
  { action: "sla_scan", labelKey: "admin_ops_console_recovery_sla_scan" },
  { action: "alert_sync", labelKey: "admin_ops_console_recovery_alert_sync" },
  { action: "stale_alerts_resolve", labelKey: "admin_ops_console_recovery_stale_alerts" },
  { action: "waiting_rider_bump", labelKey: "admin_del_ops_recovery_waiting_bump" },
  { action: "delivering_mark_attention", labelKey: "admin_del_ops_recovery_delivering_attention" },
];

const SEVERITY_KEYS: Record<PriorityInfo["severity"], MessageKey> = {
  critical: "admin_r4d_severity_critical",
  high: "admin_r4d_severity_high",
  medium: "admin_r4d_severity_medium",
  low: "admin_r4d_severity_low",
};

function fmtInt(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? formatAdminNumber(Math.round(n)) : "0";
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function field(row: Record<string, unknown>, snake: string, camel?: string): string {
  const v = row[snake] ?? (camel ? row[camel] : undefined);
  return safeTrim(v);
}

type PriorityInfo = {
  score: number;
  reasons: string[];
  severity: "critical" | "high" | "medium" | "low";
};

function parseDateMs(v: unknown): number | null {
  const s = safeTrim(v);
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function minutesSince(ms: number | null): number | null {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 60000);
}

type OpsTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function priorityForOpsRow(row: Record<string, unknown>, t: OpsTranslate): PriorityInfo {
  let score = 0;
  const reasons: string[] = [];
  const orderStatus = field(row, "order_status");
  const deliveryStatus = field(row, "delivery_status");
  const slaLevel = field(row, "sla_warning_level");
  const escalationCount = Number(row.escalation_count ?? 0) || 0;
  const repeatFire = Number(row.repeat_fire_count ?? 0) || 0;

  if (slaLevel.toLowerCase() === "critical") {
    score += 600;
    reasons.push(t("admin_ops_console_reason_sla_critical"));
  } else if (slaLevel) {
    score += 260;
    reasons.push(t("admin_ops_console_reason_sla_level", { level: slaLevel }));
  }
  if (orderStatus === "refund_requested") {
    score += 380;
    reasons.push(t("admin_ops_console_reason_refund"));
  }
  if (deliveryStatus === "waiting_rider" || !field(row, "rider_id")) {
    score += 420;
    reasons.push(t("admin_ops_console_reason_unassigned"));
  }
  const deliveredAt = parseDateMs(row.delivered_at);
  if (!deliveredAt && deliveryStatus === "delivering") {
    const startMs =
      parseDateMs(row.picked_up_at) ??
      parseDateMs(row.rider_accepted_at) ??
      parseDateMs(row.assigned_at) ??
      parseDateMs(row.updated_at);
    const mins = minutesSince(startMs);
    if (mins != null) {
      if (mins >= 180) {
        score += 520;
        reasons.push(t("admin_ops_console_reason_delivering_3h"));
      } else if (mins >= 120) {
        score += 420;
        reasons.push(t("admin_ops_console_reason_delivering_2h"));
      } else if (mins >= 60) {
        score += 220;
        reasons.push(t("admin_ops_console_reason_delivering_1h"));
      }
    }
  }
  if (escalationCount >= 3) {
    score += 220;
    reasons.push(t("admin_ops_console_reason_escalation", { count: escalationCount }));
  } else if (escalationCount >= 1) {
    score += 90;
    reasons.push(t("admin_ops_console_reason_escalation", { count: escalationCount }));
  }
  if (repeatFire >= 2) {
    score += 120;
    reasons.push(t("admin_ops_console_reason_repeat", { count: repeatFire }));
  }
  if (field(row, "settlement_id") && field(row, "settlement_status") === "held") {
    score += 200;
    reasons.push(t("admin_ops_console_reason_held_settlement"));
  }
  if (row.needs_admin_attention === true) {
    score += 140;
    reasons.push(t("admin_ops_console_reason_attention"));
  }
  if (reasons.length === 0) {
    score += 30;
    reasons.push(t("admin_ops_console_reason_queue"));
  }
  const severity: PriorityInfo["severity"] =
    score >= 600 ? "critical" : score >= 420 ? "high" : score >= 200 ? "medium" : "low";
  return { score, reasons, severity };
}

type FocusMode = "all" | "critical" | "sla" | "rider_issues" | "settlements" | "refund" | "attention" | "mine";
type GroupMode = "none" | "store" | "rider" | "region";

type ModalState =
  | null
  | { kind: "order_attention"; orderId: string; adminNote: string; prev: PrevNoteState }
  | { kind: "rider_release"; orderId: string; failureReason: string }
  | {
      kind: "rider_reassign";
      orderId: string;
      currentRiderId: string | null;
      selectedRiderId: string;
      search: string;
      allowOffline: boolean;
      adminNote: string;
      prev: PrevNoteState;
    };

function ModalShell(props: { title: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  const { t } = useI18n();
  return (
    <DibayOverlayRoot
      open
      onClose={props.busy ? undefined : props.onClose}
      dismissible={!props.busy}
      placement="center"
      zRole="dialog"
    >
      <div
        className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={OverlayUi.title}>{props.title}</h2>
            <p className={`mt-1 ${OverlayUi.caption}`}>{t("admin_ops_console_modal_hint")}</p>
          </div>
          <DibayOverlayButton
            roleTone="secondary"
            className="!min-h-9 !flex-none !px-3"
            onClick={props.onClose}
            disabled={props.busy}
          >
            {t("admin_ops_console_btn_close")}
          </DibayOverlayButton>
        </div>
        <div className="mt-4">{props.children}</div>
      </div>
    </DibayOverlayRoot>
  );
}

function PrevAdminNote({ ko, prev }: { ko: boolean; prev: PrevNoteState }) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-xs text-sam-muted">
      <div className="font-medium text-sam-fg">{ko ? "기존 메모" : "Existing note"}</div>
      {prev.state === "loading" ? (
        <div className="mt-1">
          <AdminLoadingState ko={ko} />
        </div>
      ) : prev.state === "error" ? (
        <div className="mt-1 text-sam-danger">
          {ko
            ? "기존 메모를 불러오지 못했습니다. 메모를 덮어쓰지 않도록 새 메모 저장은 막혀 있습니다."
            : "Could not load the existing note. Adding a note is disabled so it is not overwritten."}
        </div>
      ) : (
        <div className="mt-1 whitespace-pre-wrap break-words">{prev.note || (ko ? "없음" : "None")}</div>
      )}
    </div>
  );
}

const FOCUS_MODES = ["all", "critical", "sla", "rider_issues", "settlements", "refund", "attention", "mine"] as const;
const GROUP_MODES = ["none", "store", "rider", "region"] as const;
/** 큐 조건 = 주소 (R7) — `tab`(기본 risk)·`focus`(기본 all)·`group`(기본 store). 새로고침·링크 공유 시 유지. */
const LIST_CONFIG = {
  extras: ["tab", "focus", "group"] as const,
  extraDefaults: { tab: "risk", focus: "all", group: "store" },
};

export function AdminOpsConsolePage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsConsolePageInner />
    </Suspense>
  );
}

function AdminOpsConsolePageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery(LIST_CONFIG);
  const tabRaw = lq.query.extras.tab;
  const tab: TabKey = (TABS.some((d) => d.key === tabRaw) ? tabRaw : "risk") as TabKey;
  const setTab = (k: TabKey) => lq.setExtra("tab", k);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const [summary, setSummary] = useState<OpsConsoleSummary | null>(null);
  const [ops, setOps] = useState<DeliveryOperationsPayload | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [result, setResult] = useState<ResultState>(null);
  const focus: FocusMode = ((FOCUS_MODES as readonly string[]).includes(lq.query.extras.focus) ? lq.query.extras.focus : "all") as FocusMode;
  const groupMode: GroupMode = ((GROUP_MODES as readonly string[]).includes(lq.query.extras.group) ? lq.query.extras.group : "store") as GroupMode;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [riderOptions, setRiderOptions] = useState<
    { id: string; display_name: string; is_online: boolean; admin_status: string; suspended_at: string | null }[] | null
  >(null);
  const [riderOptionsErr, setRiderOptionsErr] = useState<string | null>(null);
  const [riderOptionsTotal, setRiderOptionsTotal] = useState(0);
  /** 큐 (R7 서버 페이지네이션) — 현재 탭·포커스·그룹·페이지의 행 + 전체 건수 + 탭/큐별 전체 건수. */
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [tabCountsRaw, setTabCountsRaw] = useState<Partial<Record<TabKey, number>> | null>(null);
  const [queueCounts, setQueueCounts] = useState<Record<string, number> | null>(null);
  const [queueErr, setQueueErr] = useState<{ code: string; status?: number } | null>(null);
  const queueApiQuery = lq.apiQueryString;

  const load = useCallback(async () => {
    const loadQueue = async () => {
      try {
        const r = await fetch(`/api/admin/ops-console/queue?${queueApiQuery}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as QueuePayload | null;
        if (!r.ok || !j?.ok) {
          // 실패해도 직전 목록은 지우지 않는다 (§8-5).
          setQueueErr({ code: apiErrorCode(r.status, j, "load_failed"), status: r.status });
          return;
        }
        setQueueErr(null);
        const rows = Array.isArray(j.rows) ? j.rows.filter((x) => x != null && typeof x === "object") : [];
        setQueueRows(rows);
        setQueueTotal(typeof j.total === "number" && Number.isFinite(j.total) ? j.total : rows.length);
        setTabCountsRaw(j.tab_counts ?? null);
        setQueueCounts(j.queue_counts ?? null);
      } catch {
        setQueueErr({ code: "network_error" });
      }
    };
    const loadSummary = async () => {
      try {
        const r = await fetch("/api/admin/ops-console/summary?days=7", { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as OpsConsoleSummary | null;
        if (!r.ok || !j?.ok) {
          setSummary(j);
          setOps(null);
          setLoadErr({ code: apiErrorCode(r.status, j, "load_failed"), status: r.status });
          return;
        }
        setLoadErr(null);
        setSummary(j);
        setOps(parseDeliveryOperationsPayload(j.deliveryOps));
      } catch {
        setLoadErr({ code: "network_error" });
      }
    };
    await Promise.all([loadSummary(), loadQueue()]);
  }, [queueApiQuery]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load, lq.refreshKey]);

  // 실시간 운영 큐 15초 갱신 — 탭이 숨겨지면 멈춤 · 이전 조회 진행 중이면 건너뜀 ·
  // 모달/액션 중에는 화면이 흔들리지 않게 정지
  useAdminAutoRefresh(load, { intervalMs: 15_000, paused: Boolean(busy || actionBusyKey || modal) });

  /** 재배정 후보 — 서버가 정지·일시정지를 빼고 이름 검색(q)·온라인 우선 정렬, 최대 100명 (전체 수 = riderOptionsTotal). */
  const loadRiderOptions = useCallback(async (q: string) => {
    setRiderOptionsErr(null);
    try {
      const qs = new URLSearchParams({ view: "assignable", limit: "100", offset: "0" });
      if (q.trim()) qs.set("q", q.trim());
      const r = await fetch(`/api/admin/delivery-riders?${qs.toString()}`, { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { rows?: unknown[]; total?: number } | null;
      if (!r.ok) {
        setRiderOptionsErr(apiErrorCode(r.status, j, "load_failed"));
        setRiderOptions([]);
        return;
      }
      const riders = Array.isArray(j?.rows) ? (j.rows as Record<string, unknown>[]) : [];
      setRiderOptionsTotal(typeof j?.total === "number" && Number.isFinite(j.total) ? j.total : riders.length);
      setRiderOptions(
        riders
          .map((x) => ({
            id: safeTrim(x?.id),
            display_name: safeTrim(x?.display_name),
            is_online: x?.is_online === true,
            admin_status: safeTrim(x?.admin_status) || "ok",
            suspended_at: typeof x?.suspended_at === "string" ? x.suspended_at : null,
          }))
          .filter((x) => x.id)
      );
    } catch {
      setRiderOptionsErr("network_error");
      setRiderOptions([]);
    }
  }, []);

  const riderSearch = modal && modal.kind === "rider_reassign" ? safeTrim(modal.search) : null;
  useEffect(() => {
    if (riderSearch == null) return;
    const h = window.setTimeout(() => void loadRiderOptions(riderSearch), riderSearch ? 300 : 0);
    return () => window.clearTimeout(h);
  }, [riderSearch, loadRiderOptions]);

  const riderLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return t("admin_r4d_unassigned_rider");
      const hit = riderOptions?.find((x) => x.id === id);
      if (hit?.display_name) return hit.display_name;
      const row = queueRows.find((x) => field(x, "rider_id") === id);
      return field(row ?? {}, "rider_name") || t("admin_r4d_rider_unnamed");
    },
    [riderOptions, queueRows, t]
  );

  /** 모달 열림 시 기존 메모를 읽는다 — 주의 표시는 updated_at CAS, 재배정 메모는 서버가 누적 (DEF-21). */
  const modalPrevKey =
    modal && (modal.kind === "order_attention" || modal.kind === "rider_reassign") && modal.prev.state === "loading"
      ? `${modal.kind}:${modal.orderId}`
      : null;
  useEffect(() => {
    if (!modalPrevKey) return;
    const [kind, orderId] = modalPrevKey.split(":") as ["order_attention" | "rider_reassign", string];
    let alive = true;
    void (async () => {
      let next: PrevNoteState = { state: "error" };
      try {
        if (kind === "order_attention") {
          const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/detail`, { cache: "no-store" });
          const j = (await r.json().catch(() => null)) as {
            ok?: boolean;
            order?: { adminNote?: string | null; updatedAt?: string | null };
          } | null;
          if (r.ok && j?.ok) {
            next = { state: "ready", note: safeTrim(j.order?.adminNote), updatedAt: j.order?.updatedAt ?? null };
          }
        } else {
          const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/delivery`, { cache: "no-store" });
          const j = (await r.json().catch(() => null)) as {
            ok?: boolean;
            delivery?: { admin_note?: string | null; updated_at?: string | null } | null;
          } | null;
          if (r.ok && j?.ok) {
            next = { state: "ready", note: safeTrim(j.delivery?.admin_note), updatedAt: j.delivery?.updated_at ?? null };
          }
        }
      } catch {
        next = { state: "error" };
      }
      if (!alive) return;
      setModal((m) =>
        m && (m.kind === "order_attention" || m.kind === "rider_reassign") && `${m.kind}:${m.orderId}` === modalPrevKey
          ? { ...m, prev: next }
          : m
      );
    })();
    return () => {
      alive = false;
    };
  }, [modalPrevKey]);

  /** 일괄 복구 — L3 (사유 + 작업 이름 재입력), 서버도 사유 필수·감사 기록 (DEF-22). */
  const runRecovery = async (action: DeliveryOperationRecoveryAction, label: string) => {
    if (busy) return;
    const c = await confirmAdminAction({
      level: adminActionLevel("bulk"),
      ko,
      title: t("admin_r4d_recovery_title", { label }),
      description: t("admin_r4d_recovery_desc"),
      confirmLabel: t("admin_r4d_recovery_confirm"),
      destructive: true,
      retypeValue: label,
    });
    if (!c.ok) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/delivery-operations/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: c.reason }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setResult({ ok: false, code: apiErrorCode(r.status, j, "action_failed") });
        return;
      }
      setResult({ ok: true, message: t("admin_r4d_recovery_done", { label }) });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  };

  /** 공통 실행 — 결과 배너 + 재조회. 실패 시 모달은 유지해 다시 시도할 수 있다. */
  const execAction = async (key: string, okMessage: string, fn: () => Promise<{ ok: true } | { ok: false; code: string }>) => {
    if (actionBusyKey) return;
    setActionBusyKey(key);
    setResult(null);
    try {
      const out = await fn();
      if (!out.ok) {
        setResult(out);
        return;
      }
      setModal(null);
      setResult({ ok: true, message: okMessage });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setActionBusyKey(null);
    }
  };

  const sendJson = async (url: string, method: "PATCH" | "POST", body: Record<string, unknown>) => {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!r.ok || j?.ok === false) return { ok: false as const, code: apiErrorCode(r.status, j, "action_failed") };
    return { ok: true as const };
  };

  const kpis = useMemo(() => {
    const p = ops;
    const cronAge = p?.health?.heartbeats?.alert_sync?.age_seconds ?? null;
    return {
      orders_in_progress: p ? p.kpis.orders_in_progress : null,
      sla_attention: p ? p.kpis.sla_attention_orders : null,
      unassigned: p ? p.kpis.unassigned_delivery_orders : null,
      long_delivering: queueCounts ? Number(queueCounts.long_delivering ?? 0) : null,
      failed_auto_actions: typeof summary?.kpi?.failed_auto_actions === "number" ? summary.kpi.failed_auto_actions : null,
      pending_approvals: typeof summary?.kpi?.pending_approvals === "number" ? summary.kpi.pending_approvals : null,
      held_settlements: p ? p.kpis.held_settlements_count : null,
      cron_health_age_seconds: cronAge,
    };
  }, [ops, summary, queueCounts]);

  const showNum = (v: number | null | undefined) => (typeof v === "number" ? fmtInt(v) : t("admin_r4d_unavailable"));

  const runtimeWarnings = summary?.runtime?.warnings ?? [];
  /** 서버가 정렬·필터·페이지한 행 — 화면은 사유 문구·등급만 같은 규칙(priorityForOpsRow)으로 다시 그린다. */
  const smartRows = useMemo(
    () =>
      queueRows.map((row) => ({
        row,
        pr: priorityForOpsRow(row, t),
      })),
    [queueRows, t]
  );

  /** 그룹 = 서버 group_key 순서 그대로 (한 그룹은 연속) · 건수·최고 점수는 페이지가 아닌 그룹 전체 기준. */
  const grouped = useMemo(() => {
    if (groupMode === "none") {
      return [{ key: "all", title: t("admin_ops_console_group_all"), rows: smartRows, total: queueTotal, top: smartRows[0]?.pr.score ?? 0 }];
    }
    const list: { key: string; title: string; rows: typeof smartRows; total: number; top: number }[] = [];
    for (const x of smartRows) {
      const row = x.row;
      const g = field(row, "group_key") || "unknown";
      const key = `${groupMode}:${g}`;
      const last = list[list.length - 1];
      if (last && last.key === key) {
        last.rows.push(x);
        continue;
      }
      let title: string;
      if (groupMode === "store") {
        const name = field(row, "store_name");
        title = name ? t("admin_ops_console_group_store_named", { name }) : t("admin_ops_console_group_store_id", { id: "" });
      } else if (groupMode === "rider") {
        const name = field(row, "rider_name");
        title = name
          ? t("admin_ops_console_group_rider_named", { name })
          : !field(row, "rider_id")
            ? t("admin_r4d_unassigned_rider")
            : t("admin_ops_console_group_rider_id", { id: "" });
      } else {
        title = t("admin_ops_console_group_region_named", {
          region: `${field(row, "region") || t("admin_ops_console_region_unknown")} · ${field(row, "city") || "—"}`,
        });
      }
      const totalNum = Number(row.group_total);
      const topNum = Number(row.group_top_score);
      list.push({
        key,
        title,
        rows: [x],
        total: Number.isFinite(totalNum) ? totalNum : 1,
        top: Number.isFinite(topNum) ? topNum : x.pr.score,
      });
    }
    return list;
  }, [smartRows, groupMode, queueTotal, t]);

  const toggleCollapsed = (k: string) => setCollapsed((m) => ({ ...m, [k]: !(m[k] === true) }));

  const tabCounts = useMemo(
    () => Object.fromEntries(TABS.map((d) => [d.key, Number(tabCountsRaw?.[d.key] ?? 0) || 0])) as Record<TabKey, number>,
    [tabCountsRaw]
  );

  const focusLabel = (k: FocusMode) => {
    if (k === "all") return t("admin_ops_console_focus_all");
    if (k === "critical") return t("admin_ops_console_focus_critical");
    if (k === "sla") return t("admin_ops_console_focus_sla");
    if (k === "rider_issues") return t("admin_ops_console_focus_rider");
    if (k === "settlements") return t("admin_ops_console_focus_settlements");
    if (k === "refund") return t("admin_ops_console_focus_refund");
    if (k === "attention") return t("admin_ops_console_focus_attention");
    return t("admin_ops_console_focus_mine");
  };

  const groupLabel = (g: GroupMode) => {
    if (g === "none") return t("admin_ops_console_group_none");
    if (g === "store") return t("admin_ops_console_group_store");
    if (g === "rider") return t("admin_ops_console_group_rider");
    return t("admin_ops_console_group_region");
  };

  const statusText = (row: Record<string, unknown>) => {
    const os = field(row, "order_status");
    if (os) return adminStatusLabel("store_order", os, ko).label;
    const ds = field(row, "delivery_status");
    return ds ? adminStatusLabel("rider_delivery", ds, ko).label : "—";
  };

  const failedHref = getDeliveryMetricDefinition("delivery.auto_actions_failed").href;
  const pendingHref = getDeliveryMetricDefinition("delivery.auto_actions_pending_approval").href;
  const alertsHref = getDeliveryMetricDefinition("delivery.alerts_open").href;

  const kpiCards: { labelKey: MessageKey; value: string; href?: string }[] = [
    { labelKey: "admin_ops_console_kpi_orders_in_progress", value: showNum(kpis.orders_in_progress), href: "/admin/stores/orders?tab=in_progress" },
    { labelKey: "admin_ops_console_kpi_sla_attention", value: showNum(kpis.sla_attention) },
    { labelKey: "admin_ops_console_kpi_unassigned", value: showNum(kpis.unassigned) },
    { labelKey: "admin_ops_console_kpi_long_delivering", value: showNum(kpis.long_delivering) },
    { labelKey: "admin_ops_console_kpi_failed_auto", value: showNum(kpis.failed_auto_actions), href: failedHref },
    { labelKey: "admin_ops_console_kpi_pending_appr", value: showNum(kpis.pending_approvals), href: pendingHref },
    { labelKey: "admin_ops_console_kpi_held_settlements", value: showNum(kpis.held_settlements) },
    {
      labelKey: "admin_ops_console_kpi_cron_health",
      value:
        kpis.cron_health_age_seconds == null
          ? t("admin_r4d_unavailable")
          : t("admin_ops_console_kpi_cron_minutes", { m: Math.floor(Number(kpis.cron_health_age_seconds) / 60) }),
    },
  ];

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[75vh]`}>
      <div className="sticky top-0 z-10 bg-sam-app/90 backdrop-blur border-b border-sam-border">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <AdminPageHeader
              titleKey="admin_menu_delivery_ops_console"
              titleClassName="text-[16px] font-semibold text-sam-fg truncate !mb-0"
            />
            <p className="text-xs text-sam-muted -mt-1">{t("admin_r4d_console_subtitle")}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
              <Link href="/admin/delivery-operations" className="underline text-sam-muted">
                {t("admin_r4d_console_stats_link")}
              </Link>
              <Link href={alertsHref} className="underline text-sam-muted">
                {t("admin_menu_delivery_operation_alerts")}
              </Link>
              <Link href="/admin/delivery-auto-actions" className="underline text-sam-muted">
                {t("admin_menu_delivery_auto_actions")}
              </Link>
            </div>
          </div>
          <AdminActionButton variant="secondary" disabled={busy} onClick={() => void load()} type="button">
            {t("admin_ops_console_btn_refresh")}
          </AdminActionButton>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

        {loading && !summary ? <AdminLoadingState ko={ko} /> : null}
        {loadErr ? (
          <div>
            <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={() => void load()} />
            {summary?.hint ? <AdminTechDetails ko={ko}>{summary.hint}</AdminTechDetails> : null}
          </div>
        ) : null}

        {runtimeWarnings.length ? (
          <div className={`${Sam.card.base} ${Sam.card.pad} border border-sam-warning`}>
            <div className="font-medium text-sam-warning">
              {ko ? "운영 알림 (설정 불일치)" : t("admin_ops_console_runtime_warning_title")}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-sam-warning">
              {runtimeWarnings.slice(0, 6).map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
            <AdminTechDetails ko={ko}>{runtimeWarnings.slice(0, 6).map((w) => w.code).join(", ")}</AdminTechDetails>
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          {kpiCards.map((c) => {
            const body = (
              <>
                <div className="text-xs text-sam-muted">{t(c.labelKey)}</div>
                <div className="text-[16px] font-semibold text-sam-fg">{c.value}</div>
              </>
            );
            return c.href ? (
              <Link key={c.labelKey} href={c.href} className={`${Sam.card.base} ${Sam.card.pad} hover:border-signature/40`}>
                {body}
              </Link>
            ) : (
              <div key={c.labelKey} className={`${Sam.card.base} ${Sam.card.pad}`}>
                {body}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-sam-fg">{t("admin_ops_console_quick_actions_title")}</div>
              <div className="text-xs text-sam-muted">{t("admin_ops_console_quick_actions_hint")}</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_RECOVERY.map((b) => (
                <AdminActionButton
                  key={b.action}
                  variant="secondary"
                  disabled={busy || !!actionBusyKey || !!modal}
                  onClick={() => void runRecovery(b.action, t(b.labelKey))}
                  type="button"
                >
                  {t(b.labelKey)}
                </AdminActionButton>
              ))}
            </div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`} data-ops-console-auto-actions-link="1">
            <div className="font-medium text-sam-fg">{t("admin_r4d_console_auto_card_title")}</div>
            <p className="mt-1 text-xs text-sam-muted">
              {t("admin_r4d_console_auto_card_body", {
                pending: showNum(kpis.pending_approvals),
                failed: showNum(kpis.failed_auto_actions),
              })}
            </p>
            <Link className={`${Sam.btn.secondary} mt-3 inline-flex`} href="/admin/delivery-auto-actions">
              {t("admin_r4d_console_auto_card_cta")}
            </Link>
          </div>
        </div>

        <div className={`${Sam.card.base} ${Sam.card.pad}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-sam-fg">{t("admin_ops_console_queue_title")}</div>
            <div className="text-xs text-sam-muted">
              {loading
                ? t("admin_ops_console_loading")
                : summary?.generated_at
                  ? t("admin_r4d_generated_at", { at: formatAdminManilaDateTime(summary.generated_at) })
                  : ""}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {TABS.map((d) => (
              <AdminChipButton
                key={d.key}
                type="button"
                selected={tab === d.key}
                onClick={() => setTab(d.key)}
              >
                {t(d.labelKey)} ({fmtInt(tabCounts[d.key] ?? 0)})
              </AdminChipButton>
            ))}
          </div>

          <AdminFilterBar
            className="mt-3"
            ko={ko}
            draft={lq.draft}
            onDraftChange={lq.setDraft}
            onSubmit={lq.submit}
            onReset={lq.reset}
            pending={loading}
            showPeriod={false}
            showSearch={false}
          >
            <label className="flex flex-col gap-1 text-xs text-sam-muted">
              {t("admin_ops_console_focus_label")}
              <select
                className="h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
                value={focus}
                onChange={(e) => lq.setExtra("focus", e.target.value)}
              >
                {FOCUS_MODES.map((k) => (
                  <option key={k} value={k}>
                    {focusLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-sam-muted">
              {t("admin_ops_console_group_label")}
              <select
                className="h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
                value={groupMode}
                onChange={(e) => lq.setExtra("group", e.target.value)}
              >
                {GROUP_MODES.map((g) => (
                  <option key={g} value={g}>
                    {groupLabel(g)}
                  </option>
                ))}
              </select>
            </label>
          </AdminFilterBar>
          <div className="mt-1 text-right text-xs text-sam-muted">{t("admin_ops_console_sort_hint")}</div>
          {queueErr ? (
            <div className="mt-2">
              <AdminErrorState ko={ko} code={queueErr.code} httpStatus={queueErr.status} onRetry={() => void load()} />
            </div>
          ) : null}

          <div className="mt-4 overflow-auto border border-sam-border rounded-ui-rect">
            <table className="min-w-[1120px] w-full text-sm">
              <thead className="bg-sam-surface">
                <tr className="text-left text-sam-muted">
                  <th className="px-3 py-2 w-[160px]">{t("admin_ops_console_th_order")}</th>
                  <th className="px-3 py-2 w-[200px]">{t("admin_ops_console_th_store")}</th>
                  <th className="px-3 py-2 w-[140px]">{t("admin_ops_console_th_status")}</th>
                  <th className="px-3 py-2 w-[120px]">{t("admin_ops_console_th_priority")}</th>
                  <th className="px-3 py-2">{t("admin_ops_console_th_reasons")}</th>
                  <th className="px-3 py-2 w-[280px]">{t("admin_ops_console_th_instant_action")}</th>
                  <th className="px-3 py-2 w-[200px]">{t("admin_ops_console_th_shortcuts")}</th>
                </tr>
              </thead>
              <tbody>
                {smartRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3" colSpan={7}>
                      {loading ? (
                        <AdminLoadingState ko={ko} />
                      ) : (
                        <AdminEmptyState
                          ko={ko}
                          message={focus === "all" ? t("admin_ops_console_empty_queue") : undefined}
                          onReset={focus !== "all" ? () => lq.setExtra("focus", "all") : undefined}
                        />
                      )}
                    </td>
                  </tr>
                ) : (
                  grouped.flatMap((g) => {
                    const top = g.top;
                    const low = top < 200;
                    const isCollapsed = collapsed[g.key] ?? low;
                    const headerRow = (
                      <tr key={`group:${g.key}`} className="border-t border-sam-border bg-sam-surface-muted/40">
                        <td colSpan={7} className="px-3 py-2">
                          <AdminActionButton
                            variant="quiet"
                            size="sm"
                            className="!px-0 !gap-2 !font-normal !text-sam-fg"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleCollapsed(g.key)}
                          >
                            <span className="font-medium">{isCollapsed ? "▶" : "▼"}</span>
                            <span className="font-medium">{g.title}</span>
                            <span className="text-xs text-sam-muted">({fmtInt(g.total)})</span>
                            <span className="ml-2 text-xs text-sam-muted">
                              {t("admin_ops_console_top_priority", { score: top })}
                            </span>
                            {low ? (
                              <span className="ml-2 text-xs text-sam-muted">{t("admin_ops_console_low_auto_collapse")}</span>
                            ) : null}
                          </AdminActionButton>
                        </td>
                      </tr>
                    );
                    if (isCollapsed) return [headerRow];

                    const bodyRows = g.rows.map(({ row, pr }, idx) => {
                      const oid = field(row, "order_id", "orderId");
                      const orderNo = field(row, "order_no", "orderNo") || (ko ? "주문번호 없음" : "No order no.");
                      const storeName = field(row, "store_name", "storeName") || "—";
                      const eventId = field(row, "event_id", "eventId");
                      const settlementId = field(row, "settlement_id", "settlementId");
                      const riderId = field(row, "rider_id", "riderId");
                      const sevClass =
                        pr.severity === "critical"
                          ? "text-sam-danger"
                          : pr.severity === "high"
                            ? "text-sam-warning"
                            : pr.severity === "medium"
                              ? "text-sam-fg"
                              : "text-sam-muted";
                      return (
                        <tr key={`${g.key}:${oid || "noid"}:${idx}`} className="border-t border-sam-border">
                          <td className="px-3 py-2 font-mono text-sam-fg">
                            {oid ? (
                              <Link className="underline" href={`/admin/stores/orders/${encodeURIComponent(oid)}`}>
                                {orderNo}
                              </Link>
                            ) : (
                              orderNo
                            )}
                          </td>
                          <td className="px-3 py-2 text-sam-fg">{storeName}</td>
                          <td className="px-3 py-2 text-sam-muted">{statusText(row)}</td>
                          <td className={`px-3 py-2 ${sevClass}`}>{t(SEVERITY_KEYS[pr.severity])}</td>
                          <td className="px-3 py-2 text-sam-muted truncate max-w-[520px]">{pr.reasons.join(" · ")}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {/* 행 버튼 = ghost/sm 2개 이하 — 라이더 탭은 해제·재배정, 그 외는 주의 표시 (나머지는 주문 상세) */}
                              {oid && tab !== "riders" ? (
                                <AdminActionButton
                                  variant="ghost"
                                  size="sm"
                                  disabled={!!actionBusyKey || !!modal}
                                  onClick={() =>
                                    setModal({ kind: "order_attention", orderId: oid, adminNote: "", prev: { state: "loading" } })
                                  }
                                  type="button"
                                >
                                  {ko ? "주의 표시" : t("admin_ops_console_btn_attention")}
                                </AdminActionButton>
                              ) : null}
                              {oid && tab === "riders" ? (
                                <>
                                  <AdminActionButton
                                    variant="ghost"
                                    size="sm"
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "rider_release", orderId: oid, failureReason: "" })}
                                    type="button"
                                  >
                                    {ko ? "배정 해제" : t("admin_ops_console_btn_release")}
                                  </AdminActionButton>
                                  <AdminActionButton
                                    variant="ghost"
                                    size="sm"
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() =>
                                      setModal({
                                        kind: "rider_reassign",
                                        orderId: oid,
                                        currentRiderId: riderId || null,
                                        selectedRiderId: "",
                                        search: "",
                                        allowOffline: false,
                                        adminNote: "",
                                        prev: { state: "loading" },
                                      })
                                    }
                                    type="button"
                                  >
                                    {ko ? "라이더 재배정" : t("admin_ops_console_btn_reassign")}
                                  </AdminActionButton>
                                </>
                              ) : null}
                              {!oid && tab === "riders" ? (
                                <span className="text-xs text-sam-muted">{t("admin_ops_console_no_order_id")}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {/* 바로가기 = 글자 링크 (행 버튼 수에 넣지 않는다 — 주문 상세는 주문번호 링크) */}
                              {oid ? (
                                <Link className="text-xs text-signature underline" href={`/admin/stores/orders/${encodeURIComponent(oid)}`}>
                                  {t("admin_r4d_order_detail")}
                                </Link>
                              ) : null}
                              {eventId ? (
                                <Link className="text-xs text-signature underline" href={alertsHref}>
                                  {t("admin_r4d_console_alert_link")}
                                </Link>
                              ) : null}
                              {settlementId ? (
                                <Link className="text-xs text-signature underline" href="/admin/store-settlements">
                                  {t("admin_ops_console_link_settlement")}
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                    return [headerRow, ...bodyRows];
                  })
                )}
              </tbody>
            </table>
          </div>
          {queueTotal > 0 ? (
            <AdminPagination
              ko={ko}
              page={lq.query.page}
              size={lq.query.size}
              total={queueTotal}
              onPageChange={lq.setPage}
              onSizeChange={lq.setSize}
              disabled={loading}
            />
          ) : null}
        </div>
      </div>

      {modal ? (
        modal.kind === "order_attention" ? (
          <ModalShell
            title={ko ? "주문 주의 표시" : "Mark order for attention"}
            busy={!!actionBusyKey}
            onClose={() => setModal(null)}
          >
            <PrevAdminNote ko={ko} prev={modal.prev} />
            <textarea
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={
                ko ? "추가할 관리자 메모 (선택) — 기존 메모 뒤에 덧붙습니다" : "Note to add (optional) — appended to the existing note"
              }
              value={modal.adminNote}
              onChange={(e) => setModal({ ...modal, adminNote: e.target.value })}
              rows={4}
            />
            <div className="mt-3 flex justify-end gap-2">
              <AdminActionButton variant="secondary" disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </AdminActionButton>
              <AdminActionButton
                variant="primary"
                disabled={!!actionBusyKey || modal.prev.state !== "ready"}
                onClick={() =>
                  void execAction(`attention:${modal.orderId}`, t("admin_r4d_attention_done"), async () => {
                    if (modal.prev.state !== "ready") return { ok: false, code: "load_failed" };
                    const added = safeTrim(modal.adminNote);
                    const day = formatAdminManilaDateTime(new Date().toISOString()).slice(0, 10);
                    const body: Record<string, unknown> = { needs_admin_attention: true };
                    // 기존 메모 보존 + 덧붙임, updated_at CAS 로 동시 수정 덮어쓰기 방지 (DEF-21)
                    if (added) body.admin_note = modal.prev.note ? `${modal.prev.note}\n[${day}] ${added}` : `[${day}] ${added}`;
                    if (modal.prev.updatedAt) body.expected_updated_at = modal.prev.updatedAt;
                    return sendJson(`/api/admin/store-orders/${encodeURIComponent(modal.orderId)}`, "PATCH", body);
                  })
                }
                type="button"
              >
                {ko ? "주의 표시" : t("admin_ops_console_btn_apply")}
              </AdminActionButton>
            </div>
          </ModalShell>
        ) : modal.kind === "rider_release" ? (
          <ModalShell title={t("admin_r4d_release_title")} busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <p className="mb-2 text-sm text-sam-muted">{t("admin_r4d_release_desc")}</p>
            <input
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_failure_reason")}
              value={modal.failureReason}
              onChange={(e) => setModal({ ...modal, failureReason: e.target.value })}
            />
            <div className="mt-3 flex justify-end gap-2">
              <AdminActionButton variant="secondary" disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </AdminActionButton>
              <AdminActionButton
                variant="primary"
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`release:${modal.orderId}`, t("admin_r4d_release_done"), () =>
                    sendJson(`/api/admin/store-orders/${encodeURIComponent(modal.orderId)}/delivery`, "PATCH", {
                      release_delivery_assignment: true,
                      failure_reason: safeTrim(modal.failureReason) || null,
                      reason: safeTrim(modal.failureReason) || null,
                    })
                  )
                }
                type="button"
              >
                {ko ? "배정 해제" : t("admin_ops_console_btn_release")}
              </AdminActionButton>
            </div>
          </ModalShell>
        ) : (
          <ModalShell title={ko ? "라이더 재배정" : "Reassign rider"} busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <div className="space-y-3">
              <div className="text-xs text-sam-muted">
                {t("admin_ops_console_current_rider")}{" "}
                <span className="text-sam-fg">{riderLabel(modal.currentRiderId)}</span>
              </div>
              <input
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                placeholder={t("admin_ops_console_ph_rider_search")}
                value={modal.search}
                onChange={(e) => setModal({ ...modal, search: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm text-sam-muted">
                <input
                  type="checkbox"
                  checked={modal.allowOffline}
                  onChange={(e) => setModal({ ...modal, allowOffline: e.target.checked })}
                />
                {t("admin_ops_console_allow_offline_assign")}
              </label>
              {riderOptionsErr ? (
                <div className="text-sm text-sam-danger">
                  {t("admin_ops_console_rider_load_failed", { error: adminOperatorErrorMessage(riderOptionsErr, ko) })}
                </div>
              ) : riderOptions == null ? (
                <div className="text-sm text-sam-muted">{t("admin_ops_console_rider_loading")}</div>
              ) : (
                <select
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                  value={modal.selectedRiderId}
                  onChange={(e) => setModal({ ...modal, selectedRiderId: e.target.value })}
                >
                  <option value="">{t("admin_ops_console_ph_rider_select")}</option>
                  {riderOptions
                    .filter((r) => modal.allowOffline || r.is_online)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.is_online ? t("admin_ops_console_rider_option_online") : t("admin_ops_console_rider_option_offline")}
                        {r.display_name || t("admin_r4d_rider_unnamed")}
                      </option>
                    ))}
                </select>
              )}
              {riderOptions != null && riderOptionsTotal > riderOptions.length ? (
                <div className="text-xs text-sam-muted" data-ops-console-rider-pick-partial="1">
                  {ko
                    ? `배정 가능 ${fmtInt(riderOptionsTotal)}명 중 ${fmtInt(riderOptions.length)}명 표시 (온라인 우선) — 이름으로 좁혀 주세요`
                    : `Showing ${fmtInt(riderOptions.length)} of ${fmtInt(riderOptionsTotal)} assignable riders (online first) — narrow by name`}
                </div>
              ) : null}
              {modal.selectedRiderId && modal.currentRiderId && modal.selectedRiderId === modal.currentRiderId ? (
                <div className="text-sm text-sam-warning">{t("admin_ops_console_rider_same_warning")}</div>
              ) : null}
              {modal.selectedRiderId && !modal.allowOffline && riderOptions?.find((x) => x.id === modal.selectedRiderId && !x.is_online) ? (
                <div className="text-sm text-sam-warning">{t("admin_ops_console_rider_offline_warning")}</div>
              ) : null}
              <PrevAdminNote ko={ko} prev={modal.prev} />
              <textarea
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                placeholder={ko ? "추가할 배달 메모 (선택) — 기존 메모 뒤에 덧붙습니다" : "Delivery note to add (optional) — appended"}
                value={modal.adminNote}
                onChange={(e) => setModal({ ...modal, adminNote: e.target.value })}
                rows={3}
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <AdminActionButton variant="secondary" disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </AdminActionButton>
              <AdminActionButton
                variant="primary"
                disabled={
                  !!actionBusyKey ||
                  safeTrim(modal.selectedRiderId).length === 0 ||
                  (modal.currentRiderId != null && modal.selectedRiderId === modal.currentRiderId)
                }
                onClick={async () => {
                  if (actionBusyKey) return;
                  const to = safeTrim(modal.selectedRiderId);
                  // L2 — 사유 필수. 재배정 기록은 서버 감사 기록에 메모와 분리해 남는다 (DEF-21·22).
                  const c = await confirmAdminAction({
                    level: adminActionLevel("sanction"),
                    ko,
                    title: t("admin_r4d_reassign_title", { from: riderLabel(modal.currentRiderId), to: riderLabel(to) }),
                    description: t("admin_r4d_reassign_desc"),
                    confirmLabel: t("admin_r4d_reassign_confirm"),
                  });
                  if (!c.ok) return;
                  const added = safeTrim(modal.adminNote);
                  void execAction(`reassign:${modal.orderId}`, t("admin_r4d_reassign_done"), () =>
                    sendJson(`/api/admin/store-orders/${encodeURIComponent(modal.orderId)}/delivery`, "PATCH", {
                      reassign_rider_id: to,
                      expected_rider_id: modal.currentRiderId,
                      allow_offline_assign: modal.allowOffline,
                      reason: c.reason,
                      ...(added ? { append_admin_note: added } : {}),
                    })
                  );
                }}
                type="button"
              >
                {ko ? "라이더 재배정" : t("admin_ops_console_btn_reassign")}
              </AdminActionButton>
            </div>
          </ModalShell>
        )
      ) : null}
    </div>
  );
}
