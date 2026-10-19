"use client";

/**
 * 실시간 상황판 (`/admin/ops-console`) — DUP-2: 실시간 조치(일괄 복구 L3 · 라이더 재배정 L2 ·
 * 배정 해제 · 주의 표시)만 이 화면에서 한다. 경고 처리 → 배달 경고, 자동 조치 승인/거절/재실행 →
 * 자동 조치 승인 화면으로 **링크만** 둔다. 통계는 배달 통계(읽기 전용).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { getDeliveryMetricDefinition } from "@/lib/admin/metrics/delivery-metrics";

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

const QUEUE_KEYS: Record<TabKey, string[]> = {
  risk: ["urgent_flagged", "sla_attention", "eta_overdue", "long_delivering", "unassigned"],
  sla: ["sla_attention", "eta_overdue"],
  riders: ["unassigned", "long_delivering"],
  settlements: ["held_settlements", "refund_requested"],
  incidents: ["sla_attention"],
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
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";
}

function getQueueCount(p: DeliveryOperationsPayload | null, keys: string[]): number {
  if (!p) return 0;
  let sum = 0;
  for (const k of keys) sum += p.queues[k]?.length ?? 0;
  return sum;
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
        <div className="mt-1">{ko ? "불러오는 중…" : "Loading…"}</div>
      ) : prev.state === "error" ? (
        <div className="mt-1 text-red-700">
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

export function AdminOpsConsolePage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [tab, setTab] = useState<TabKey>("risk");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const [summary, setSummary] = useState<OpsConsoleSummary | null>(null);
  const [ops, setOps] = useState<DeliveryOperationsPayload | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [focus, setFocus] = useState<FocusMode>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("store");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [riderOptions, setRiderOptions] = useState<
    { id: string; display_name: string; is_online: boolean; admin_status: string; suspended_at: string | null }[] | null
  >(null);
  const [riderOptionsErr, setRiderOptionsErr] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    const id = window.setInterval(() => {
      // 모달/액션 중에는 자동 새로고침으로 화면이 흔들리지 않게 정지
      if (busy || actionBusyKey || modal) return;
      void load();
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [load, busy, actionBusyKey, modal]);

  const loadRiderOptions = useCallback(async () => {
    setRiderOptionsErr(null);
    try {
      const r = await fetch("/api/admin/delivery-riders", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { riders?: unknown[] } | null;
      if (!r.ok) {
        setRiderOptionsErr(apiErrorCode(r.status, j, "load_failed"));
        setRiderOptions([]);
        return;
      }
      const riders = Array.isArray(j?.riders) ? (j.riders as Record<string, unknown>[]) : [];
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

  useEffect(() => {
    if (!modal || modal.kind !== "rider_reassign") return;
    if (riderOptions != null || riderOptionsErr) return;
    void loadRiderOptions();
  }, [modal, riderOptions, riderOptionsErr, loadRiderOptions]);

  const riderLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return t("admin_r4d_unassigned_rider");
      const hit = riderOptions?.find((x) => x.id === id);
      return hit?.display_name || t("admin_r4d_rider_unnamed");
    },
    [riderOptions, t]
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
      level: "L3",
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
      long_delivering: p ? (p.queues.long_delivering?.length ?? 0) : null,
      failed_auto_actions: typeof summary?.kpi?.failed_auto_actions === "number" ? summary.kpi.failed_auto_actions : null,
      pending_approvals: typeof summary?.kpi?.pending_approvals === "number" ? summary.kpi.pending_approvals : null,
      held_settlements: p ? p.kpis.held_settlements_count : null,
      cron_health_age_seconds: cronAge,
    };
  }, [ops, summary]);

  const showNum = (v: number | null | undefined) => (typeof v === "number" ? fmtInt(v) : t("admin_r4d_unavailable"));

  const runtimeWarnings = summary?.runtime?.warnings ?? [];
  const currentQueues = useMemo(() => {
    if (!ops) return [];
    const merged: Record<string, unknown>[] = [];
    for (const k of QUEUE_KEYS[tab] ?? []) merged.push(...(ops.queues[k] ?? []));
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const row of merged) {
      const oid = field(row, "order_id", "orderId");
      if (oid) {
        if (seen.has(oid)) continue;
        seen.add(oid);
      }
      out.push(row);
      if (out.length >= 120) break;
    }
    return out;
  }, [ops, tab]);

  const smartRows = useMemo(() => {
    const rows = currentQueues.map((row) => ({
      row,
      pr: priorityForOpsRow(row, t),
      updatedMs: parseDateMs(row.updated_at) ?? 0,
    }));
    const viewer = safeTrim(summary?.viewer_admin_id);
    const filtered = rows.filter(({ row, pr }) => {
      if (focus === "all") return true;
      if (focus === "critical") return pr.severity === "critical";
      if (focus === "sla") return field(row, "sla_warning_level") !== "";
      if (focus === "rider_issues") {
        const ds = field(row, "delivery_status");
        return ds === "waiting_rider" || ds === "delivering" || field(row, "rider_id") === "";
      }
      if (focus === "settlements") return field(row, "settlement_id") !== "" || field(row, "settlement_status") === "held";
      if (focus === "refund") return field(row, "order_status") === "refund_requested";
      if (focus === "attention") return row.needs_admin_attention === true;
      const assigned = field(row, "assigned_admin_id");
      return assigned !== "" && viewer !== "" && assigned === viewer;
    });
    filtered.sort((a, b) => {
      if (b.pr.score !== a.pr.score) return b.pr.score - a.pr.score;
      const ea = Number(a.row.escalation_count ?? 0) || 0;
      const eb = Number(b.row.escalation_count ?? 0) || 0;
      if (eb !== ea) return eb - ea;
      if (b.updatedMs !== a.updatedMs) return b.updatedMs - a.updatedMs;
      return field(a.row, "order_id").localeCompare(field(b.row, "order_id"));
    });
    return filtered;
  }, [currentQueues, focus, summary, t]);

  const grouped = useMemo(() => {
    if (groupMode === "none") {
      return [{ key: "all", title: t("admin_ops_console_group_all"), rows: smartRows }];
    }
    const map = new Map<string, { key: string; title: string; rows: typeof smartRows }>();
    for (const x of smartRows) {
      const row = x.row;
      const g =
        groupMode === "store"
          ? field(row, "store_id") || "unknown_store"
          : groupMode === "rider"
            ? field(row, "rider_id") || "unknown_rider"
            : `${field(row, "region") || t("admin_ops_console_region_unknown")} · ${field(row, "city") || "—"}`;
      let title: string;
      if (groupMode === "store") {
        const name = field(row, "store_name");
        title = name ? t("admin_ops_console_group_store_named", { name }) : t("admin_ops_console_group_store_id", { id: "" });
      } else if (groupMode === "rider") {
        const name = field(row, "rider_name");
        title = name
          ? t("admin_ops_console_group_rider_named", { name })
          : g === "unknown_rider"
            ? t("admin_r4d_unassigned_rider")
            : t("admin_ops_console_group_rider_id", { id: "" });
      } else {
        title = t("admin_ops_console_group_region_named", { region: g });
      }
      const key = `${groupMode}:${g || "unknown"}`;
      const cur = map.get(key);
      if (cur) cur.rows.push(x);
      else map.set(key, { key, title, rows: [x] });
    }
    const list = [...map.values()];
    list.sort((a, b) => {
      const ap = a.rows[0]?.pr.score ?? 0;
      const bp = b.rows[0]?.pr.score ?? 0;
      if (bp !== ap) return bp - ap;
      return a.key.localeCompare(b.key);
    });
    return list;
  }, [smartRows, groupMode, t]);

  const toggleCollapsed = (k: string) => setCollapsed((m) => ({ ...m, [k]: !(m[k] === true) }));

  const tabCounts = useMemo(
    () =>
      Object.fromEntries(TABS.map((d) => [d.key, getQueueCount(ops, QUEUE_KEYS[d.key] ?? [])])) as Record<TabKey, number>,
    [ops]
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
              titleClassName="text-lg font-semibold text-sam-fg truncate !mb-0"
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
          <button className={Sam.btn.secondary} disabled={busy} onClick={() => void load()} type="button">
            {t("admin_ops_console_btn_refresh")}
          </button>
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
          <div className={`${Sam.card.base} ${Sam.card.pad} border border-amber-300`}>
            <div className="font-medium text-amber-800">
              {ko ? "운영 알림 (설정 불일치)" : t("admin_ops_console_runtime_warning_title")}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
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
                <div className="text-lg font-semibold text-sam-fg">{c.value}</div>
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
                <button
                  key={b.action}
                  className={Sam.btn.secondary}
                  disabled={busy || !!actionBusyKey || !!modal}
                  onClick={() => void runRecovery(b.action, t(b.labelKey))}
                  type="button"
                >
                  {t(b.labelKey)}
                </button>
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
              <button
                key={d.key}
                type="button"
                className={tab === d.key ? Sam.btn.primary : Sam.btn.secondary}
                onClick={() => setTab(d.key)}
              >
                {t(d.labelKey)} ({fmtInt(tabCounts[d.key] ?? 0)})
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-sam-muted">{t("admin_ops_console_focus_label")}</div>
            {(["all", "critical", "sla", "rider_issues", "settlements", "refund", "attention", "mine"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={focus === k ? Sam.btn.primary : Sam.btn.secondary}
                onClick={() => setFocus(k)}
              >
                {focusLabel(k)}
              </button>
            ))}
            <div className="ml-2 text-xs text-sam-muted">{t("admin_ops_console_group_label")}</div>
            {(["none", "store", "rider", "region"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={groupMode === g ? Sam.btn.primary : Sam.btn.secondary}
                onClick={() => setGroupMode(g)}
              >
                {groupLabel(g)}
              </button>
            ))}
            <div className="ml-auto text-xs text-sam-muted">{t("admin_ops_console_sort_hint")}</div>
          </div>

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
                    <td className="px-3 py-6 text-sam-muted" colSpan={7}>
                      {t("admin_ops_console_empty_queue")}
                    </td>
                  </tr>
                ) : (
                  grouped.flatMap((g) => {
                    const top = g.rows[0]?.pr.score ?? 0;
                    const low = top < 200;
                    const isCollapsed = collapsed[g.key] ?? low;
                    const headerRow = (
                      <tr key={`group:${g.key}`} className="border-t border-sam-border bg-sam-surface-muted/40">
                        <td colSpan={7} className="px-3 py-2">
                          <button
                            type="button"
                            className="flex items-center gap-2 text-sm text-sam-fg"
                            onClick={() => toggleCollapsed(g.key)}
                          >
                            <span className="font-medium">{isCollapsed ? "▶" : "▼"}</span>
                            <span className="font-medium">{g.title}</span>
                            <span className="text-xs text-sam-muted">({g.rows.length})</span>
                            <span className="ml-2 text-xs text-sam-muted">
                              {t("admin_ops_console_top_priority", { score: top })}
                            </span>
                            {low ? (
                              <span className="ml-2 text-xs text-sam-muted">{t("admin_ops_console_low_auto_collapse")}</span>
                            ) : null}
                          </button>
                        </td>
                      </tr>
                    );
                    if (isCollapsed) return [headerRow];

                    const bodyRows = g.rows.slice(0, 40).map(({ row, pr }, idx) => {
                      const oid = field(row, "order_id", "orderId");
                      const orderNo = field(row, "order_no", "orderNo") || (ko ? "주문번호 없음" : "No order no.");
                      const storeName = field(row, "store_name", "storeName") || "—";
                      const eventId = field(row, "event_id", "eventId");
                      const settlementId = field(row, "settlement_id", "settlementId");
                      const riderId = field(row, "rider_id", "riderId");
                      const sevClass =
                        pr.severity === "critical"
                          ? "text-red-700"
                          : pr.severity === "high"
                            ? "text-amber-800"
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
                              {oid ? (
                                <button
                                  className={Sam.btn.secondary}
                                  disabled={!!actionBusyKey || !!modal}
                                  onClick={() =>
                                    setModal({ kind: "order_attention", orderId: oid, adminNote: "", prev: { state: "loading" } })
                                  }
                                  type="button"
                                >
                                  {ko ? "주의 표시" : t("admin_ops_console_btn_attention")}
                                </button>
                              ) : null}
                              {oid && tab === "riders" ? (
                                <>
                                  <button
                                    className={Sam.btn.secondary}
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "rider_release", orderId: oid, failureReason: "" })}
                                    type="button"
                                  >
                                    {ko ? "배정 해제" : t("admin_ops_console_btn_release")}
                                  </button>
                                  <button
                                    className={Sam.btn.primary}
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
                                  </button>
                                </>
                              ) : null}
                              {!oid && tab === "riders" ? (
                                <span className="text-xs text-sam-muted">{t("admin_ops_console_no_order_id")}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {oid ? (
                                <Link className={Sam.btn.secondary} href={`/admin/stores/orders/${encodeURIComponent(oid)}`}>
                                  {t("admin_r4d_order_detail")}
                                </Link>
                              ) : null}
                              {eventId ? (
                                <Link className={Sam.btn.secondary} href={alertsHref}>
                                  {t("admin_r4d_console_alert_link")}
                                </Link>
                              ) : null}
                              {settlementId ? (
                                <Link className={Sam.btn.secondary} href="/admin/store-settlements">
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
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
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
              </button>
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
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
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
              </button>
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
                <div className="text-sm text-red-700">
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
                    .filter((r) => {
                      if (r.suspended_at || r.admin_status === "paused") return false;
                      if (!modal.allowOffline && !r.is_online) return false;
                      const q = safeTrim(modal.search).toLowerCase();
                      return !q || r.display_name.toLowerCase().includes(q);
                    })
                    .slice(0, 80)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.is_online ? t("admin_ops_console_rider_option_online") : t("admin_ops_console_rider_option_offline")}
                        {r.display_name || t("admin_r4d_rider_unnamed")}
                      </option>
                    ))}
                </select>
              )}
              {modal.selectedRiderId && modal.currentRiderId && modal.selectedRiderId === modal.currentRiderId ? (
                <div className="text-sm text-amber-800">{t("admin_ops_console_rider_same_warning")}</div>
              ) : null}
              {modal.selectedRiderId && !modal.allowOffline && riderOptions?.find((x) => x.id === modal.selectedRiderId && !x.is_online) ? (
                <div className="text-sm text-amber-800">{t("admin_ops_console_rider_offline_warning")}</div>
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
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
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
                    level: "L2",
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
              </button>
            </div>
          </ModalShell>
        )
      ) : null}
    </div>
  );
}
