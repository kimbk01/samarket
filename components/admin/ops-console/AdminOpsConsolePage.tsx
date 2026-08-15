"use client";

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
};

const TABS = [
  { key: "risk", labelKey: "admin_ops_console_tab_risk" },
  { key: "sla", labelKey: "admin_ops_console_tab_sla" },
  { key: "riders", labelKey: "admin_ops_console_tab_riders" },
  { key: "auto_actions", labelKey: "admin_ops_console_tab_auto_actions" },
  { key: "settlements", labelKey: "admin_ops_console_tab_settlements" },
  { key: "incidents", labelKey: "admin_ops_console_tab_incidents" },
] as const satisfies readonly { key: string; labelKey: MessageKey }[];

const QUEUE_KEYS: Record<(typeof TABS)[number]["key"], string[]> = {
  risk: ["urgent_flagged", "sla_attention", "eta_overdue", "long_delivering", "unassigned"],
  sla: ["sla_attention", "eta_overdue"],
  riders: ["unassigned", "long_delivering"],
  auto_actions: ["sla_attention"], // 대체: auto action 자체는 별도 KPI/링크
  settlements: ["held_settlements", "refund_requested"],
  incidents: ["sla_attention"], // fallback
};

const QUICK_RECOVERY: { action: DeliveryOperationRecoveryAction; labelKey: MessageKey }[] = [
  { action: "sla_scan", labelKey: "admin_ops_console_recovery_sla_scan" },
  { action: "alert_sync", labelKey: "admin_ops_console_recovery_alert_sync" },
  { action: "auto_action_runner", labelKey: "admin_ops_console_recovery_auto_action_runner" },
  { action: "alert_pipeline", labelKey: "admin_ops_console_recovery_alert_pipeline" },
  { action: "stale_alerts_resolve", labelKey: "admin_ops_console_recovery_stale_alerts" },
  { action: "bulk_retry_failed_auto_actions", labelKey: "admin_ops_console_recovery_bulk_retry" },
];

type AutoActionRow = {
  id: string;
  event_id?: string | null;
  order_id?: string | null;
  order_no?: string | null;
  action_type?: string | null;
  action_status?: string | null;
  retry_count?: number | null;
  max_retries?: number | null;
  result_message?: string | null;
  decided_at?: string | null;
  executed_at?: string | null;
  rule_name?: string | null;
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

function rowOrderId(row: Record<string, unknown>): string {
  const oid = typeof row.order_id === "string" ? row.order_id : row.orderId;
  return typeof oid === "string" ? oid.trim() : "";
}

function rowOrderNo(row: Record<string, unknown>): string {
  const v = typeof row.order_no === "string" ? row.order_no : row.orderNo;
  return typeof v === "string" ? v.trim() : "";
}

function rowStoreName(row: Record<string, unknown>): string {
  const v = typeof row.store_name === "string" ? row.store_name : row.storeName;
  return typeof v === "string" ? v.trim() : "";
}

function rowStatus(row: Record<string, unknown>): string {
  const v = typeof row.order_status === "string" ? row.order_status : row.delivery_status;
  return typeof v === "string" ? v.trim() : "";
}

function rowEventId(row: Record<string, unknown>): string {
  const v = typeof row.event_id === "string" ? row.event_id : row.eventId;
  return typeof v === "string" ? v.trim() : "";
}

function rowSettlementId(row: Record<string, unknown>): string {
  const v = typeof row.settlement_id === "string" ? row.settlement_id : row.settlementId;
  return typeof v === "string" ? v.trim() : "";
}

function rowRiderId(row: Record<string, unknown>): string {
  const v = typeof row.rider_id === "string" ? row.rider_id : row.riderId;
  return typeof v === "string" ? v.trim() : "";
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
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

  const orderStatus = safeTrim(row.order_status);
  const deliveryStatus = safeTrim(row.delivery_status);
  const slaLevel = safeTrim((row as any).sla_warning_level);
  const escalationCount = Number((row as any).escalation_count ?? 0) || 0;
  const repeatFire = Number((row as any).repeat_fire_count ?? 0) || 0;

  // SLA level (critical > warning)
  if (slaLevel.toLowerCase() === "critical") {
    score += 600;
    reasons.push(t("admin_ops_console_reason_sla_critical"));
  } else if (slaLevel) {
    score += 260;
    reasons.push(t("admin_ops_console_reason_sla_level", { level: slaLevel }));
  }

  // refund_requested is always operator attention
  if (orderStatus === "refund_requested") {
    score += 380;
    reasons.push(t("admin_ops_console_reason_refund"));
  }

  // unassigned rider
  if (deliveryStatus === "waiting_rider" || !safeTrim((row as any).rider_id)) {
    score += 420;
    reasons.push(t("admin_ops_console_reason_unassigned"));
  }

  // long delivering heuristics (based on updated_at/assigned timestamps if present)
  const deliveredAt = parseDateMs((row as any).delivered_at);
  if (!deliveredAt && deliveryStatus === "delivering") {
    const startMs =
      parseDateMs((row as any).picked_up_at) ??
      parseDateMs((row as any).rider_accepted_at) ??
      parseDateMs((row as any).assigned_at) ??
      parseDateMs((row as any).updated_at);
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

  // escalation / repeat fire from alert events
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

  // held settlements
  if (safeTrim((row as any).settlement_id) && safeTrim((row as any).settlement_status) === "held") {
    score += 200;
    reasons.push(t("admin_ops_console_reason_held_settlement"));
  }

  // attention flag (if present on row)
  if ((row as any).needs_admin_attention === true) {
    score += 140;
    reasons.push(t("admin_ops_console_reason_attention"));
  }

  // default mild priority if it ended up in queue without clear reason
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
  | { kind: "alert_ack"; eventId: string; orderId?: string; note: string }
  | { kind: "alert_resolve"; eventId: string; orderId?: string; note: string }
  | { kind: "auto_approve"; actionId: string; note: string }
  | { kind: "auto_reject"; actionId: string; note: string }
  | { kind: "settlement_hold"; settlementId: string; holdReason: string }
  | { kind: "settlement_paid"; settlementId: string; payoutNote: string }
  | { kind: "order_attention"; orderId: string; attention: boolean; adminNote: string }
  | { kind: "rider_release"; orderId: string; failureReason: string }
  | {
      kind: "rider_reassign";
      orderId: string;
      currentRiderId: string | null;
      selectedRiderId: string;
      search: string;
      allowOffline: boolean;
      adminNote: string;
    };

function ModalShell(props: {
  titleKey: MessageKey;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
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
            <h2 className={OverlayUi.title}>{t(props.titleKey)}</h2>
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

export function AdminOpsConsolePage() {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("risk");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<OpsConsoleSummary | null>(null);
  const [ops, setOps] = useState<DeliveryOperationsPayload | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [autoActions, setAutoActions] = useState<AutoActionRow[] | null>(null);
  const [focus, setFocus] = useState<FocusMode>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("store");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [riderOptions, setRiderOptions] = useState<
    { id: string; display_name: string; is_online: boolean; admin_status: string; suspended_at: string | null }[] | null
  >(null);
  const [riderOptionsErr, setRiderOptionsErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch("/api/admin/ops-console/summary?days=7", { cache: "no-store" });
    const j = (await r.json()) as OpsConsoleSummary;
    if (!r.ok || !j.ok) {
      setSummary(j);
      setOps(null);
      setErr(j.error ?? t("admin_ops_console_err_load_failed"));
      return;
    }
    setSummary(j);
    const parsed = parseDeliveryOperationsPayload(j.deliveryOps);
    setOps(parsed);
  }, [t]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    const t = window.setInterval(() => {
      // 모달/액션 중에는 자동 refresh로 화면이 흔들리지 않게 정지
      if (busy || actionBusyKey || modal) return;
      void load();
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [load, busy, actionBusyKey, modal]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const loadAutoActions = useCallback(async () => {
    // pending approvals + failed만 보여주기 (콘솔 즉시 액션 목적)
    const [pendRes, failRes] = await Promise.all([
      fetch("/api/admin/delivery-auto-actions?limit=35&status=pending_approval", { cache: "no-store" }),
      fetch("/api/admin/delivery-auto-actions?limit=25&status=failed", { cache: "no-store" }),
    ]);
    const pj = (await pendRes.json().catch(() => null)) as any;
    const fj = (await failRes.json().catch(() => null)) as any;
    const pend = Array.isArray(pj?.actions) ? (pj.actions as AutoActionRow[]) : [];
    const fail = Array.isArray(fj?.actions) ? (fj.actions as AutoActionRow[]) : [];
    const merged = [...pend, ...fail].filter((x) => x && typeof x.id === "string" && x.id.trim());
    setAutoActions(merged.slice(0, 60));
  }, []);

  useEffect(() => {
    if (tab !== "auto_actions") return;
    let alive = true;
    void (async () => {
      try {
        await loadAutoActions();
      } catch {
        if (alive) setAutoActions([]);
      }
    })();
    const t = window.setInterval(() => {
      if (busy || actionBusyKey || modal) return;
      void loadAutoActions();
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [tab, loadAutoActions, busy, actionBusyKey, modal]);

  const loadRiderOptions = useCallback(async () => {
    setRiderOptionsErr(null);
    const r = await fetch("/api/admin/delivery-riders", { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok) {
      setRiderOptionsErr(String(j?.error ?? `HTTP ${r.status}`));
      setRiderOptions([]);
      return;
    }
    const riders = Array.isArray(j?.riders) ? (j.riders as any[]) : [];
    const list = riders
      .map((x) => ({
        id: safeTrim(x?.id),
        display_name: safeTrim(x?.display_name) || safeTrim(x?.user_id).slice(0, 8) || safeTrim(x?.id).slice(0, 8),
        is_online: x?.is_online === true,
        admin_status: safeTrim(x?.admin_status) || "ok",
        suspended_at: typeof x?.suspended_at === "string" ? x.suspended_at : null,
      }))
      .filter((x) => x.id);
    setRiderOptions(list);
  }, []);

  useEffect(() => {
    if (!modal || modal.kind !== "rider_reassign") return;
    if (riderOptions != null || riderOptionsErr) return;
    void loadRiderOptions();
  }, [modal, riderOptions, riderOptionsErr, loadRiderOptions]);

  const runRecovery = async (action: DeliveryOperationRecoveryAction) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/delivery-operations/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; message?: string };
      if (!r.ok) throw new Error(j.error ?? j.message ?? "recovery_failed");
      await load();
      setToast(t("admin_ops_console_toast_recovery_done"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin_ops_console_err_recovery_failed"));
    } finally {
      setBusy(false);
    }
  };

  const execAction = async (key: string, fn: () => Promise<void>) => {
    if (actionBusyKey) return;
    setActionBusyKey(key);
    setErr(null);
    try {
      await fn();
      setToast(t("admin_ops_console_toast_action_done"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin_ops_console_err_action_failed"));
    } finally {
      setActionBusyKey(null);
    }
  };

  const patchAlertEvent = async (eventId: string, action: "acknowledge" | "resolve", note?: string) => {
    const r = await fetch(`/api/admin/delivery-operation-alerts/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(note ? { note } : {}) }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  };

  const patchOrderAttention = async (orderId: string, attention: boolean, adminNote?: string) => {
    const body: Record<string, unknown> = { needs_admin_attention: attention };
    const note = safeTrim(adminNote);
    if (note) body.admin_note = note;
    const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  };

  const patchSettlement = async (settlementId: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/admin/store-settlements/${encodeURIComponent(settlementId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  };

  const patchAdminDelivery = async (orderId: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/delivery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  };

  const postAutoAction = async (actionId: string, verb: "approve" | "reject" | "retry", note?: string) => {
    const r = await fetch(`/api/admin/delivery-auto-actions/${encodeURIComponent(actionId)}/${verb}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: verb === "retry" ? undefined : JSON.stringify({ note: safeTrim(note).slice(0, 2000) }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string; hint?: string };
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    if (j && typeof (j as any).error === "string") throw new Error(String((j as any).error));
  };

  const kpis = useMemo(() => {
    const p = ops;
    const failedAuto = summary?.kpi?.failed_auto_actions ?? 0;
    const pendingAppr = summary?.kpi?.pending_approvals ?? 0;
    const cronAge = p?.health?.heartbeats?.alert_sync?.age_seconds ?? null;
    return {
      orders_in_progress: p?.kpis.orders_in_progress ?? 0,
      sla_attention: p?.kpis.sla_attention_orders ?? 0,
      unassigned: p?.kpis.unassigned_delivery_orders ?? 0,
      long_delivering: (p?.queues.long_delivering?.length ?? 0) || 0,
      failed_auto_actions: failedAuto,
      pending_approvals: pendingAppr,
      held_settlements: p?.kpis.held_settlements_count ?? 0,
      cron_health_age_seconds: cronAge,
    };
  }, [ops, summary]);

  const runtimeWarnings = summary?.runtime?.warnings ?? [];
  const currentQueues = useMemo(() => {
    const p = ops;
    if (!p) return [];
    const keys = QUEUE_KEYS[tab] ?? [];
    const merged: Record<string, unknown>[] = [];
    for (const k of keys) merged.push(...(p.queues[k] ?? []));
    // de-dupe by order_id when possible
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const row of merged) {
      const oid = rowOrderId(row);
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
    const rows = currentQueues.map((row) => {
      const pr = priorityForOpsRow(row, t);
      const updatedMs = parseDateMs((row as any).updated_at) ?? 0;
      return { row, pr, updatedMs };
    });

    const filtered = rows.filter(({ row, pr }) => {
      if (focus === "all") return true;
      if (focus === "critical") return pr.severity === "critical";
      if (focus === "sla") return safeTrim((row as any).sla_warning_level) !== "";
      if (focus === "rider_issues") {
        const ds = safeTrim((row as any).delivery_status);
        return ds === "waiting_rider" || ds === "delivering" || safeTrim((row as any).rider_id) === "";
      }
      if (focus === "settlements") return safeTrim((row as any).settlement_id) !== "" || safeTrim((row as any).settlement_status) === "held";
      if (focus === "refund") return safeTrim((row as any).order_status) === "refund_requested";
      if (focus === "attention") return (row as any).needs_admin_attention === true;
      if (focus === "mine") {
        const assigned = safeTrim((row as any).assigned_admin_id);
        const viewer = safeTrim((summary as any)?.viewer_admin_id);
        return assigned !== "" && viewer !== "" && assigned === viewer;
      }
      return true;
    });

    filtered.sort((a, b) => {
      // priority desc
      if (b.pr.score !== a.pr.score) return b.pr.score - a.pr.score;
      // escalation desc
      const ea = Number((a.row as any).escalation_count ?? 0) || 0;
      const eb = Number((b.row as any).escalation_count ?? 0) || 0;
      if (eb !== ea) return eb - ea;
      // updated desc (newest first)
      if (b.updatedMs !== a.updatedMs) return b.updatedMs - a.updatedMs;
      // stable by order id
      const oa = rowOrderId(a.row);
      const ob = rowOrderId(b.row);
      return oa.localeCompare(ob);
    });

    return filtered;
  }, [currentQueues, focus, summary, t, language]);

  const grouped = useMemo(() => {
    if (groupMode === "none") {
      return [{ key: "all", title: t("admin_ops_console_group_all"), rows: smartRows }];
    }
    const map = new Map<string, { key: string; title: string; rows: typeof smartRows }>();
    for (const x of smartRows) {
      const row = x.row;
      const g =
        groupMode === "store"
          ? safeTrim((row as any).store_id) || "unknown_store"
          : groupMode === "rider"
            ? safeTrim((row as any).rider_id) || "unknown_rider"
            : `${safeTrim((row as any).region) || t("admin_ops_console_region_unknown")} · ${safeTrim((row as any).city) || "—"}`;
      const title = (() => {
        if (groupMode === "store") {
          const name = safeTrim((row as any).store_name);
          return name
            ? t("admin_ops_console_group_store_named", { name })
            : t("admin_ops_console_group_store_id", { id: g.slice(0, 8) || "—" });
        }
        if (groupMode === "rider") {
          const name = safeTrim((row as any).rider_name);
          return name
            ? t("admin_ops_console_group_rider_named", { name })
            : t("admin_ops_console_group_rider_id", { id: g.slice(0, 8) || "—" });
        }
        return t("admin_ops_console_group_region_named", { region: g });
      })();
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
  }, [smartRows, groupMode, t, language]);

  const toggleCollapsed = (k: string) => setCollapsed((m) => ({ ...m, [k]: !(m[k] === true) }));

  const tabCounts = useMemo(() => {
    return Object.fromEntries(
      TABS.map((tabDef) => [tabDef.key, getQueueCount(ops, QUEUE_KEYS[tabDef.key] ?? [])])
    ) as Record<(typeof TABS)[number]["key"], number>;
  }, [ops]);

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

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[75vh]`}>
      {toast ? (
        <div className="fixed right-4 top-4 z-50">
          <div className={`${Sam.card.base} ${Sam.card.pad} border border-sam-border bg-sam-surface`}>
            <div className="text-sm text-sam-fg">{toast}</div>
          </div>
        </div>
      ) : null}

      <div className="sticky top-0 z-10 bg-sam-app/90 backdrop-blur border-b border-sam-border">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <AdminPageHeader
              titleKey="admin_ops_console_page_title"
              titleClassName="text-lg font-semibold text-sam-fg truncate !mb-0"
            />
            <div className="text-xs text-sam-muted truncate -mt-1">
              {t("admin_ops_console_subtitle_refresh")} ·{" "}
              <Link href="/admin/delivery-operations" className="underline">
                delivery-operations
              </Link>{" "}
              ·{" "}
              <Link href="/admin/delivery-alerts" className="underline">
                delivery-alerts
              </Link>{" "}
              ·{" "}
              <Link href="/admin/delivery-auto-actions" className="underline">
                auto-actions
              </Link>{" "}
              ·{" "}
              <Link href="/admin/runtime-health" className="underline">
                runtime-health
              </Link>
            </div>
          </div>
          <button className={Sam.btn.secondary} disabled={busy} onClick={() => void load()} type="button">
            {t("admin_ops_console_btn_refresh")}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {err ? (
          <div className={`${Sam.card.base} ${Sam.card.pad} border border-red-300`}>
            <div className="font-medium text-red-700">{t("admin_ops_console_err_title")}</div>
            <div className="mt-2 text-sm text-red-700 break-all">{err}</div>
            {summary?.hint ? <div className="mt-2 text-xs text-sam-muted">{summary.hint}</div> : null}
          </div>
        ) : null}

        {runtimeWarnings.length ? (
          <div className={`${Sam.card.base} ${Sam.card.pad} border border-amber-300`}>
            <div className="font-medium text-amber-800">{t("admin_ops_console_runtime_warning_title")}</div>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {runtimeWarnings.slice(0, 6).map((w) => (
                <li key={w.code}>
                  <span className="font-mono text-xs">{w.code}</span> — {w.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_orders_in_progress")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.orders_in_progress)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_sla_attention")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.sla_attention)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_unassigned")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.unassigned)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_long_delivering")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.long_delivering)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_failed_auto")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.failed_auto_actions)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_pending_appr")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.pending_approvals)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_held_settlements")}</div>
            <div className="text-lg font-semibold text-sam-fg">{fmtInt(kpis.held_settlements)}</div>
          </div>
          <div className={`${Sam.card.base} ${Sam.card.pad}`}>
            <div className="text-xs text-sam-muted">{t("admin_ops_console_kpi_cron_health")}</div>
            <div className="text-lg font-semibold text-sam-fg">
              {kpis.cron_health_age_seconds == null
                ? "—"
                : t("admin_ops_console_kpi_cron_minutes", {
                    m: Math.floor(Number(kpis.cron_health_age_seconds) / 60),
                  })}
            </div>
          </div>
        </div>

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
                onClick={() => void runRecovery(b.action)}
                type="button"
              >
                {t(b.labelKey)}
              </button>
            ))}
            <Link className={Sam.btn.secondary} href="/admin/delivery-auto-actions">
              {t("admin_ops_console_quick_auto_actions_detail")}
            </Link>
          </div>
        </div>

        <div className={`${Sam.card.base} ${Sam.card.pad}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-sam-fg">{t("admin_ops_console_queue_title")}</div>
            <div className="text-xs text-sam-muted">
              {loading ? t("admin_ops_console_loading") : (summary?.generated_at ?? "")}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {TABS.map((tabDef) => (
              <button
                key={tabDef.key}
                type="button"
                className={tab === tabDef.key ? Sam.btn.primary : Sam.btn.secondary}
                onClick={() => setTab(tabDef.key)}
              >
                {t(tabDef.labelKey)} ({fmtInt(tabCounts[tabDef.key] ?? 0)})
              </button>
            ))}
          </div>

          {tab !== "auto_actions" ? (
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
          ) : null}

          {tab === "auto_actions" ? (
            <div className="mt-4 overflow-auto border border-sam-border rounded-ui-rect">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-sam-surface">
                  <tr className="text-left text-sam-muted">
                    <th className="px-3 py-2 w-[180px]">{t("admin_ops_console_th_order")}</th>
                    <th className="px-3 py-2 w-[180px]">{t("admin_ops_console_th_status")}</th>
                    <th className="px-3 py-2 w-[220px]">{t("admin_ops_console_th_rule")}</th>
                    <th className="px-3 py-2">{t("admin_ops_console_th_message")}</th>
                    <th className="px-3 py-2 w-[300px]">{t("admin_ops_console_th_instant_action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(autoActions ?? []).length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-sam-muted" colSpan={5}>
                        {t("admin_ops_console_empty_auto_queue")}
                      </td>
                    </tr>
                  ) : (
                    (autoActions ?? []).map((a) => {
                      const aid = safeTrim(a.id);
                      const oid = safeTrim(a.order_id);
                      const orderNo = safeTrim(a.order_no) || (oid ? oid.slice(0, 8) : "—");
                      const st = safeTrim(a.action_status) || "—";
                      const ru = safeTrim(a.rule_name) || safeTrim(a.action_type) || "—";
                      const msg = safeTrim(a.result_message);
                      const canApprove = st === "pending_approval";
                      const canReject = st === "pending_approval";
                      const canRetry = st === "failed";
                      return (
                        <tr key={aid} className="border-t border-sam-border">
                          <td className="px-3 py-2 font-mono text-sam-fg">
                            {oid ? (
                              <Link className="underline" href={`/admin/delivery-orders/${encodeURIComponent(oid)}`}>
                                {orderNo}
                              </Link>
                            ) : (
                              orderNo
                            )}
                          </td>
                          <td className="px-3 py-2 text-sam-muted">{st}</td>
                          <td className="px-3 py-2 text-sam-fg">{ru}</td>
                          <td className="px-3 py-2 text-sam-muted truncate max-w-[420px]">{msg || "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {canApprove ? (
                                <button
                                  className={Sam.btn.primary}
                                  disabled={!!actionBusyKey || !!modal}
                                  onClick={() => setModal({ kind: "auto_approve", actionId: aid, note: "" })}
                                  type="button"
                                >
                                  {t("admin_ops_console_btn_approve")}
                                </button>
                              ) : null}
                              {canReject ? (
                                <button
                                  className={Sam.btn.secondary}
                                  disabled={!!actionBusyKey || !!modal}
                                  onClick={() => setModal({ kind: "auto_reject", actionId: aid, note: "" })}
                                  type="button"
                                >
                                  {t("admin_ops_console_btn_reject")}
                                </button>
                              ) : null}
                              {canRetry ? (
                                <button
                                  className={Sam.btn.secondary}
                                  disabled={!!actionBusyKey || !!modal}
                                  onClick={() =>
                                    void execAction(`auto_retry:${aid}`, async () => {
                                      await postAutoAction(aid, "retry");
                                      await Promise.all([load(), loadAutoActions()]);
                                    })
                                  }
                                  type="button"
                                >
                                  {t("admin_ops_console_btn_retry")}
                                </button>
                              ) : null}
                              <Link className={Sam.btn.secondary} href="/admin/delivery-auto-actions">
                                {t("admin_ops_console_btn_detail")}
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
          <div className="mt-4 overflow-auto border border-sam-border rounded-ui-rect">
            <table className="min-w-[1120px] w-full text-sm">
              <thead className="bg-sam-surface">
                <tr className="text-left text-sam-muted">
                  <th className="px-3 py-2 w-[160px]">{t("admin_ops_console_th_order")}</th>
                  <th className="px-3 py-2 w-[220px]">{t("admin_ops_console_th_store")}</th>
                  <th className="px-3 py-2 w-[160px]">{t("admin_ops_console_th_status")}</th>
                  <th className="px-3 py-2 w-[140px]">{t("admin_ops_console_th_priority")}</th>
                  <th className="px-3 py-2">{t("admin_ops_console_th_reasons")}</th>
                  <th className="px-3 py-2 w-[260px]">{t("admin_ops_console_th_instant_action")}</th>
                  <th className="px-3 py-2 w-[220px]">{t("admin_ops_console_th_shortcuts")}</th>
                </tr>
              </thead>
              <tbody>
                {smartRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sam-muted" colSpan={6}>
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
                        <td colSpan={6} className="px-3 py-2">
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
                      const oid = rowOrderId(row);
                      const orderNo = rowOrderNo(row) || (oid ? oid.slice(0, 8) : `row_${idx}`);
                      const storeName = rowStoreName(row) || "—";
                      const st = rowStatus(row) || "—";
                      const eventId = rowEventId(row);
                      const settlementId = rowSettlementId(row);
                      const riderId = rowRiderId(row);

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
                          <td className="px-3 py-2 font-mono text-sam-fg">{orderNo}</td>
                          <td className="px-3 py-2 text-sam-fg">{storeName}</td>
                          <td className="px-3 py-2 text-sam-muted">{st}</td>
                          <td className={`px-3 py-2 font-mono ${sevClass}`}>
                            {pr.score} <span className="text-xs">{pr.severity}</span>
                          </td>
                          <td className="px-3 py-2 text-sam-muted truncate max-w-[520px]">
                            {pr.reasons.join(" · ")}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {eventId && (tab === "risk" || tab === "sla" || tab === "incidents") ? (
                                <>
                                  <button
                                    className={Sam.btn.secondary}
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "alert_ack", eventId, orderId: oid || undefined, note: "" })}
                                    type="button"
                                  >
                                    {t("admin_ops_console_btn_ack")}
                                  </button>
                                  <button
                                    className={Sam.btn.secondary}
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "alert_resolve", eventId, orderId: oid || undefined, note: "" })}
                                    type="button"
                                  >
                                    {t("admin_ops_console_btn_resolve")}
                                  </button>
                                </>
                              ) : null}

                              {oid ? (
                                <button
                                  className={Sam.btn.secondary}
                                  disabled={!!actionBusyKey || !!modal}
                                  onClick={() => setModal({ kind: "order_attention", orderId: oid, attention: true, adminNote: "" })}
                                  type="button"
                                >
                                  {t("admin_ops_console_btn_attention")}
                                </button>
                              ) : null}

                              {settlementId && tab === "settlements" ? (
                                <>
                                  <button
                                    className={Sam.btn.secondary}
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "settlement_hold", settlementId, holdReason: "" })}
                                    type="button"
                                  >
                                    {t("admin_ops_console_btn_hold")}
                                  </button>
                                  <button
                                    className={Sam.btn.primary}
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "settlement_paid", settlementId, payoutNote: "" })}
                                    type="button"
                                  >
                                    {t("admin_ops_console_btn_paid")}
                                  </button>
                                </>
                              ) : null}

                              {oid && tab === "riders" ? (
                                <>
                                  <button
                                    className={Sam.btn.secondary}
                                    disabled={!!actionBusyKey || !!modal}
                                    onClick={() => setModal({ kind: "rider_release", orderId: oid, failureReason: "" })}
                                    type="button"
                                  >
                                    {t("admin_ops_console_btn_release")}
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
                                        adminNote: riderId ? `prev_rider:${riderId}` : "",
                                      })
                                    }
                                    type="button"
                                  >
                                    {t("admin_ops_console_btn_reassign")}
                                  </button>
                                </>
                              ) : null}

                              {!eventId && (tab === "risk" || tab === "sla" || tab === "incidents") ? (
                                <span className="text-xs text-sam-muted">{t("admin_ops_console_no_event_id")}</span>
                              ) : null}
                              {!settlementId && tab === "settlements" ? (
                                <span className="text-xs text-sam-muted">{t("admin_ops_console_no_settlement_id")}</span>
                              ) : null}
                              {!oid && tab === "riders" ? (
                                <span className="text-xs text-sam-muted">{t("admin_ops_console_no_order_id")}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {oid ? (
                                <>
                                  <Link className={Sam.btn.secondary} href={`/admin/delivery-orders/${encodeURIComponent(oid)}`}>
                                    {t("admin_ops_console_link_order")}
                                  </Link>
                                  <Link className={Sam.btn.secondary} href={`/admin/stores/orders/${encodeURIComponent(oid)}`}>
                                    {t("admin_ops_console_link_store_order")}
                                  </Link>
                                </>
                              ) : null}
                              {settlementId ? (
                                <Link className={Sam.btn.secondary} href={`/admin/store-settlements`}>
                                  {t("admin_ops_console_link_settlement")}
                                </Link>
                              ) : null}
                              <Link className={Sam.btn.secondary} href="/admin/delivery-operations">
                                {t("admin_ops_console_link_ops_hub")}
                              </Link>
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
          )}
        </div>
      </div>

      {modal ? (
        modal.kind === "alert_ack" ? (
          <ModalShell titleKey="admin_ops_console_modal_alert_ack_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <textarea
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_note_optional")}
              value={modal.note}
              onChange={(e) => setModal({ ...modal, note: e.target.value })}
              rows={4}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`ack:${modal.eventId}`, async () => {
                    await patchAlertEvent(modal.eventId, "acknowledge", modal.note);
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_confirm")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "alert_resolve" ? (
          <ModalShell titleKey="admin_ops_console_modal_alert_resolve_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <textarea
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_resolve_note")}
              value={modal.note}
              onChange={(e) => setModal({ ...modal, note: e.target.value })}
              rows={4}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`resolve:${modal.eventId}`, async () => {
                    await patchAlertEvent(modal.eventId, "resolve", modal.note);
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_resolve_action")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "auto_approve" ? (
          <ModalShell titleKey="admin_ops_console_modal_auto_approve_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <textarea
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_approve_note")}
              value={modal.note}
              onChange={(e) => setModal({ ...modal, note: e.target.value })}
              rows={4}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`auto_approve:${modal.actionId}`, async () => {
                    await postAutoAction(modal.actionId, "approve", modal.note);
                    setModal(null);
                    await Promise.all([load(), loadAutoActions()]);
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_approve")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "auto_reject" ? (
          <ModalShell titleKey="admin_ops_console_modal_auto_reject_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <textarea
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_reject_note")}
              value={modal.note}
              onChange={(e) => setModal({ ...modal, note: e.target.value })}
              rows={4}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`auto_reject:${modal.actionId}`, async () => {
                    await postAutoAction(modal.actionId, "reject", modal.note);
                    setModal(null);
                    await Promise.all([load(), loadAutoActions()]);
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_reject")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "settlement_hold" ? (
          <ModalShell titleKey="admin_ops_console_modal_settlement_hold_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <input
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_hold_reason")}
              value={modal.holdReason}
              onChange={(e) => setModal({ ...modal, holdReason: e.target.value })}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
                disabled={!!actionBusyKey || safeTrim(modal.holdReason).length === 0}
                onClick={() =>
                  void execAction(`settle_hold:${modal.settlementId}`, async () => {
                    await patchSettlement(modal.settlementId, {
                      settlement_status: "held",
                      hold_reason: safeTrim(modal.holdReason).slice(0, 500),
                    });
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_hold")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "settlement_paid" ? (
          <ModalShell titleKey="admin_ops_console_modal_settlement_paid_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <textarea
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_payout_note")}
              value={modal.payoutNote}
              onChange={(e) => setModal({ ...modal, payoutNote: e.target.value })}
              rows={4}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className={Sam.btn.secondary} disabled={!!actionBusyKey} onClick={() => setModal(null)} type="button">
                {t("admin_ops_console_btn_cancel")}
              </button>
              <button
                className={Sam.btn.primary}
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`settle_paid:${modal.settlementId}`, async () => {
                    await patchSettlement(modal.settlementId, {
                      settlement_status: "paid",
                      payout_note: safeTrim(modal.payoutNote).slice(0, 2000) || null,
                    });
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_paid")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "order_attention" ? (
          <ModalShell titleKey="admin_ops_console_modal_order_attention_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <textarea
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
              placeholder={t("admin_ops_console_ph_admin_note")}
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
                disabled={!!actionBusyKey}
                onClick={() =>
                  void execAction(`attention:${modal.orderId}`, async () => {
                    await patchOrderAttention(modal.orderId, modal.attention, modal.adminNote);
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_apply")}
              </button>
            </div>
          </ModalShell>
        ) : modal.kind === "rider_release" ? (
          <ModalShell titleKey="admin_ops_console_modal_rider_release_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
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
                  void execAction(`release:${modal.orderId}`, async () => {
                    await patchAdminDelivery(modal.orderId, {
                      release_delivery_assignment: true,
                      failure_reason: safeTrim(modal.failureReason) || null,
                    });
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_release")}
              </button>
            </div>
          </ModalShell>
        ) : (
          <ModalShell titleKey="admin_ops_console_modal_rider_reassign_title" busy={!!actionBusyKey} onClose={() => setModal(null)}>
            <div className="space-y-3">
              <div className="text-xs text-sam-muted">
                {t("admin_ops_console_current_rider")}{" "}
                <span className="font-mono text-sam-fg">{modal.currentRiderId ? modal.currentRiderId.slice(0, 8) : "—"}</span>
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
                  {t("admin_ops_console_rider_load_failed", { error: riderOptionsErr })}
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
                      if (!q) return true;
                      return (
                        r.display_name.toLowerCase().includes(q) ||
                        r.id.toLowerCase().includes(q) ||
                        r.id.slice(0, 8).toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 80)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.is_online ? t("admin_ops_console_rider_option_online") : t("admin_ops_console_rider_option_offline")}
                        {r.display_name} · {r.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              )}

              {modal.selectedRiderId && modal.currentRiderId && modal.selectedRiderId === modal.currentRiderId ? (
                <div className="text-sm text-amber-800">{t("admin_ops_console_rider_same_warning")}</div>
              ) : null}

              {modal.selectedRiderId && !modal.allowOffline && riderOptions ? (
                riderOptions.find((x) => x.id === modal.selectedRiderId && !x.is_online) ? (
                  <div className="text-sm text-amber-800">{t("admin_ops_console_rider_offline_warning")}</div>
                ) : null
              ) : null}

              <textarea
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                placeholder={t("admin_ops_console_ph_admin_note_short")}
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
                onClick={() =>
                  void execAction(`reassign:${modal.orderId}`, async () => {
                    await patchAdminDelivery(modal.orderId, {
                      reassign_rider_id: safeTrim(modal.selectedRiderId),
                      allow_offline_assign: modal.allowOffline,
                      admin_note: safeTrim(modal.adminNote) || null,
                    });
                    setModal(null);
                    await load();
                  })
                }
                type="button"
              >
                {t("admin_ops_console_btn_reassign")}
              </button>
            </div>
          </ModalShell>
        )
      ) : null}
    </div>
  );
}

