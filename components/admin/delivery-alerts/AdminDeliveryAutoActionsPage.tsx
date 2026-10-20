"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AUTO_ACTION_TYPE_KEYS,
  resolveDeliveryAlertBannerLabel,
} from "@/components/admin/i18n/admin-delivery-alerts-label-keys";
import {
  AdminErrorState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { DeliveryOperationRecoveryAction } from "@/lib/admin/delivery-operation-recovery-actions";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

type ResultState = { ok: true; message: string } | { ok: false; code: string } | null;

const STATUS_FILTERS = ["all", "pending_approval", "success", "failed", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function readStatus(sp: URLSearchParams): StatusFilter {
  const v = sp.get("status");
  return (STATUS_FILTERS as readonly string[]).includes(v ?? "") ? (v as StatusFilter) : "all";
}

/** 자동 조치 관련 일괄 작업 — 실시간 상황판에서 이 화면으로 옮겼다 (DUP-2). L3 확인. */
const AUTO_BULK_ACTIONS: { action: DeliveryOperationRecoveryAction; labelKey: MessageKey }[] = [
  { action: "bulk_retry_failed_auto_actions", labelKey: "admin_r4d_auto_bulk_retry" },
  { action: "auto_action_runner", labelKey: "admin_r4d_auto_bulk_runner" },
  { action: "alert_pipeline", labelKey: "admin_ops_console_recovery_alert_pipeline" },
];

function apiErr(status: number, j: unknown, fallback: string): string {
  const e = j != null && typeof j === "object" ? (j as { error?: unknown }).error : undefined;
  // 코드 형태(snake_case)만 사용 — DB 원문 메시지 등은 화면에 노출하지 않는다.
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

type ActionRow = {
  id: string;
  event_id: string;
  action_type: string;
  action_status: string;
  executed_at: string;
  executed_by_system?: boolean;
  result_message?: string | null;
  metadata?: Record<string, unknown> | null;
  retry_count?: number;
  max_retries?: number;
  order_id?: string | null;
  order_no?: string;
  rule_key?: string;
  rule_name?: string;
  rule_id?: string;
  event_status?: string;
  admin_order_url?: string;
  stale_pending?: boolean;
  dangerous_action?: boolean;
  retry_eligible?: boolean;
};

type RulePick = { id: string; rule_key: string; rule_name: string };

type RuleStat = {
  rule_id: string;
  rule_key: string;
  rule_name: string;
  dangerous?: boolean;
  actions_today?: number;
  success_today?: number;
  failed_today?: number;
  rejected_today?: number;
  pending_open?: number;
  avg_approval_wait_minutes_today?: number | null;
  avg_retry_today?: number | null;
};

type DashboardPayload = {
  kill_switch_on?: boolean;
  dangerous_instant_misconfigured?: boolean;
  cron_suspect_stale_ratio?: boolean;
  kpi?: Record<string, unknown>;
  banners?: unknown;
  rules?: unknown;
  rule_picklist?: unknown;
  generated_at?: string;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDeliveryAutoActionsPage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryAutoActionsPageInner />
    </Suspense>
  );
}

function AdminDeliveryAutoActionsPageInner() {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ko = language !== "en";
  const dash = t("admin_del_common_dash");
  const [killOn, setKillOn] = useState(false);
  const [killBusy, setKillBusy] = useState(false);
  const [result, setResult] = useState<ResultState>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [rulePicklist, setRulePicklist] = useState<RulePick[]>([]);
  // URL `status` 필터 — 대시보드·상황판 지표 링크가 필터된 상태로 연다 (DEF-53 계열)
  const [filterStatus, setFilterStatusState] = useState<StatusFilter>(() =>
    readStatus(new URLSearchParams(searchParams.toString()))
  );
  const setFilterStatus = useCallback(
    (v: StatusFilter) => {
      setFilterStatusState(v);
      const qs = new URLSearchParams(searchParams.toString());
      if (v === "all") qs.delete("status");
      else qs.set("status", v);
      const q = qs.toString();
      router.replace(`${pathname || "/admin/delivery-auto-actions"}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const [ruleId, setRuleId] = useState<string>("");
  const [dangerousOnly, setDangerousOnly] = useState(false);
  const [retryOnly, setRetryOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const [memo, setMemo] = useState<Record<string, string>>({});

  /** 권위 스위치 상태 — 불러오지 못하면 「확인 불가」로 두고 토글을 막는다 (꺼짐으로 가장하지 않음). */
  const loadSettings = useCallback(() => {
    void fetch("/api/admin/delivery-auto-actions/settings", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || typeof d?.settings?.delivery_auto_actions_enabled !== "boolean") {
          setSettingsErr(apiErr(r.status, d, "load_failed"));
          setSettingsLoaded(false);
          return;
        }
        setKillOn(d.settings.delivery_auto_actions_enabled);
        setSettingsErr(null);
        setSettingsLoaded(true);
      })
      .catch(() => {
        setSettingsErr("network_error");
        setSettingsLoaded(false);
      });
  }, []);

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    if (filterStatus !== "all") qs.set("status", filterStatus);
    if (ruleId.trim()) qs.set("rule_id", ruleId.trim());
    if (dangerousOnly) qs.set("dangerous_only", "1");
    if (retryOnly) qs.set("retry_only", "1");
    if (todayOnly) qs.set("today_only", "1");
    return qs.toString();
  }, [filterStatus, ruleId, dangerousOnly, retryOnly, todayOnly]);

  const loadData = useCallback(() => {
    setLoading(true);
    void fetch(`/api/admin/delivery-auto-actions?${buildQuery()}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setLoadErr({ code: r.status === 503 ? "schema_missing" : apiErr(r.status, j, "load_failed"), status: r.status });
          setActions([]);
          setDashboard(null);
          setLoading(false);
          return;
        }
        const list = Array.isArray(j?.actions) ? j.actions : [];
        setActions(list.filter((x: unknown): x is ActionRow => x != null && typeof x === "object"));
        const dash = j?.dashboard && typeof j.dashboard === "object" ? (j.dashboard as DashboardPayload) : null;
        setDashboard(dash);
        const pick = Array.isArray(dash?.rule_picklist) ? (dash!.rule_picklist as RulePick[]) : [];
        setRulePicklist(pick.filter((x) => x && typeof x.id === "string"));
        setLoadErr(null);
        setLoading(false);
      })
      .catch(() => {
        setLoadErr({ code: "network_error" });
        setLoading(false);
      });
  }, [buildQuery]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * 자동 조치 전체 중지/재허용 — **권위 스위치** (DEF-42: 러너가 읽는 delivery_auto_actions_runtime_settings).
   * L1 확인 + 중복 클릭 방지 + CAS(expected_enabled) + 결과 배너 + 재조회 (DEF-22).
   */
  const toggleKill = useCallback(
    async (nextEnabled: boolean) => {
      if (killBusy || !settingsLoaded) return;
      const c = await confirmAdminAction({
        level: "L1",
        ko,
        title: nextEnabled
          ? ko
            ? "자동 조치를 다시 허용할까요?"
            : "Allow auto actions again?"
          : ko
            ? "자동 조치를 전체 중지할까요?"
            : "Stop all auto actions?",
        description: nextEnabled
          ? ko
            ? "규칙에 따라 자동 조치가 다시 실행됩니다."
            : "Auto actions will run again according to rules."
          : ko
            ? "모든 규칙의 자동 조치가 실행되지 않습니다. 승인 대기 건도 처리되지 않습니다."
            : "No rule will run auto actions. Pending approvals will not be processed.",
        confirmLabel: nextEnabled ? (ko ? "다시 허용" : "Allow") : ko ? "전체 중지" : "Stop all",
        destructive: !nextEnabled,
      });
      if (!c.ok) return;
      setKillBusy(true);
      setResult(null);
      try {
        const r = await fetch("/api/admin/delivery-auto-actions/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_auto_actions_enabled: nextEnabled, expected_enabled: killOn }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          setResult({ ok: false, code: apiErr(r.status, j, "update_failed") });
          loadSettings();
          return;
        }
        setKillOn(nextEnabled);
        setResult({
          ok: true,
          message: nextEnabled
            ? ko
              ? "자동 조치를 다시 허용했습니다."
              : "Auto actions allowed."
            : ko
              ? "자동 조치를 전체 중지했습니다."
              : "All auto actions stopped.",
        });
        loadSettings();
        loadData();
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        setKillBusy(false);
      }
    },
    [killBusy, killOn, ko, loadData, loadSettings, settingsLoaded]
  );

  /** 자동 조치 일괄 작업 — L3 (사유 + 작업 이름 재입력). 서버: business 권한·사유 필수·감사 기록. */
  const runBulk = useCallback(
    async (action: DeliveryOperationRecoveryAction, label: string) => {
      if (bulkBusy) return;
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
      setBulkBusy(true);
      setResult(null);
      try {
        const r = await fetch("/api/admin/delivery-operations/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: c.reason }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setResult({ ok: false, code: apiErr(r.status, j, "action_failed") });
          return;
        }
        setResult({ ok: true, message: t("admin_r4d_recovery_done", { label }) });
        loadData();
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        setBulkBusy(false);
      }
    },
    [bulkBusy, ko, t, loadData]
  );

  const postAction = useCallback(
    async (a: ActionRow, path: "approve" | "reject" | "retry") => {
      if (busyId) return;
      const actionId = a.id;
      const target = a.order_no || a.rule_name || (ko ? "이 자동 조치" : "this auto action");
      const typeLabel = a.action_type ? t(AUTO_ACTION_TYPE_KEYS[a.action_type] ?? "admin_del_alert_auto_off") : "";
      const c = await confirmAdminAction(
        path === "approve"
          ? {
              level: "L2",
              ko,
              title: ko ? `자동 조치 승인: ${target}` : `Approve auto action: ${target}`,
              description: ko
                ? `승인하면 「${typeLabel}」 조치가 바로 실행됩니다.`
                : `Approving runs "${typeLabel}" immediately.`,
              confirmLabel: ko ? "승인하고 실행" : "Approve and run",
              destructive: !!a.dangerous_action,
            }
          : path === "reject"
            ? {
                level: "L2",
                ko,
                title: ko ? `자동 조치 반려: ${target}` : `Reject auto action: ${target}`,
                description: ko ? "반려하면 이 조치는 실행되지 않습니다." : "This action will not run.",
                confirmLabel: ko ? "반려" : "Reject",
              }
            : {
                level: "L1",
                ko,
                title: ko ? `자동 조치 재실행: ${target}` : `Re-run auto action: ${target}`,
                description: ko ? `「${typeLabel}」 조치를 다시 실행합니다.` : `Runs "${typeLabel}" again.`,
                confirmLabel: ko ? "재실행" : "Re-run",
              }
      );
      if (!c.ok) return;
      setBusyId(actionId);
      setResult(null);
      const memoText = (memo[actionId] ?? "").trim();
      // 승인·거절 = L2: 사유는 서버가 필수 검증하고 감사 기록에 남긴다 (DEF-40)
      const body =
        path === "retry" ? undefined : JSON.stringify({ reason: c.reason ?? "", note: memoText || undefined });
      try {
        const r = await fetch(`/api/admin/delivery-auto-actions/${encodeURIComponent(actionId)}/${path}`, {
          method: "POST",
          ...(path === "retry" ? {} : { headers: { "Content-Type": "application/json" }, body }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setResult({ ok: false, code: apiErr(r.status, j, "action_failed") });
          loadData();
          return;
        }
        setMemo((m) => ({ ...m, [actionId]: "" }));
        // 승인·재실행은 결정은 기록됐어도 조치 실행이 실패하면 RPC 가 `{ ok: false }` 를 돌려준다 → 성공으로 표시하지 않는다.
        const rpcResult = j != null && typeof j === "object" ? (j as { result?: { ok?: unknown } }).result : undefined;
        if (path !== "reject" && rpcResult && rpcResult.ok === false) {
          setResult({ ok: false, code: "auto_action_effect_failed" });
          loadData();
          return;
        }
        setResult({
          ok: true,
          message:
            path === "approve"
            ? ko
              ? "승인했습니다."
              : "Approved."
            : path === "reject"
              ? ko
                ? "반려했습니다."
                : "Rejected."
              : ko
                ? "재실행을 요청했습니다."
                : "Re-run requested.",
        });
        loadData();
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, memo, loadData, ko, t]
  );

  const filterStatusLabel = useCallback(
    (f: string) => {
      if (f === "all") return t("common_all");
      if (f === "pending_approval") return t("admin_del_alert_filter_pending_approval");
      return adminStatusLabel("auto_action", f, ko).label;
    },
    [t, ko]
  );

  const ruleStatsHeaders = useMemo(
    () =>
      [
        "admin_del_alert_th_rule",
        "admin_del_alert_th_dangerous",
        "admin_del_alert_th_today_created",
        "admin_del_alert_th_success",
        "admin_del_alert_th_failed",
        "admin_del_alert_th_rejected",
        "admin_del_alert_th_pending_all",
        "admin_del_alert_th_avg_approval",
        "admin_del_alert_th_avg_retry",
      ] as const,
    []
  );

  const actionTableHeaders = useMemo(
    () =>
      [
        "admin_del_alert_th_time",
        "admin_del_alert_th_rule",
        "admin_del_alert_th_action_type",
        "admin_del_alert_th_status",
        "admin_del_alert_th_message",
        "admin_del_alert_th_retry",
        "admin_del_alert_th_order",
        "admin_del_alert_th_process",
      ] as const,
    []
  );

  const kpi = dashboard?.kpi ?? null;
  const banners = useMemo(() => {
    const raw = dashboard?.banners;
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }, [dashboard?.banners]);
  const ruleStats = useMemo(() => {
    const raw = dashboard?.rules;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is RuleStat => x != null && typeof x === "object" && "rule_id" in x);
  }, [dashboard?.rules]);

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        title={ko ? "자동 조치 승인" : "Auto action approval"}
        description={t("admin_del_alert_auto_page_desc")}
      />

      {!dashboard && !loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          {ko
            ? "운영 리포트를 아직 불러올 수 없어 지표가 비어 있습니다. 계속되면 시스템 관리자에게 문의하세요."
            : "The operations report is not available yet, so metrics are empty. Contact a system admin if this persists."}
        </div>
      ) : null}

      {dashboard && !dashboard.dangerous_instant_misconfigured ? (
        <div className="rounded-ui-rect border border-sam-border/70 bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          {t("admin_del_alert_dangerous_policy_before")}
          <span className="font-medium">{t(AUTO_ACTION_TYPE_KEYS.auto_hold_settlement)}</span>
          {t("admin_del_alert_dangerous_policy_mid")}
          <span className="font-medium">{t(AUTO_ACTION_TYPE_KEYS.auto_reassign_rider)}</span>
          {t("admin_del_alert_dangerous_policy_mid")}
          <span className="font-medium">{t(AUTO_ACTION_TYPE_KEYS.auto_mute)}</span>
          {t("admin_del_alert_dangerous_policy_after")}
        </div>
      ) : null}

      {banners.length ? (
        <div className="space-y-2">
          {banners.map((code) => (
            <div
              key={code}
              className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-3 py-2 sam-text-xxs text-sam-warning"
            >
              {resolveDeliveryAlertBannerLabel(t, code)}
            </div>
          ))}
        </div>
      ) : null}

      {kpi ? (
        <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-xxs">
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_pending")} <strong className="text-sam-fg">{num(kpi.pending_total)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_stale_pending")} <strong className="text-sam-fg">{num(kpi.pending_stale_30m)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_today_success")} <strong className="text-sam-fg">{num(kpi.today_success)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_today_failed")} <strong className="text-sam-fg">{num(kpi.today_failed)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_today_rejected")} <strong className="text-sam-fg">{num(kpi.today_rejected)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_retry_needed")} <strong className="text-sam-fg">{num(kpi.retry_needed)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_dangerous_pending")} <strong className="text-sam-fg">{num(kpi.dangerous_pending)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            {t("admin_del_alert_kpi_avg_approval_wait")}{" "}
            <strong className="text-sam-fg">
              {kpi.avg_approval_wait_minutes_today == null ? dash : String(kpi.avg_approval_wait_minutes_today)}
            </strong>
          </span>
        </div>
      ) : null}

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <summary className="cursor-pointer px-3 py-2 sam-text-xxs font-medium text-sam-fg">
          {t("admin_del_alert_rule_stats_summary")}
        </summary>
        <div className="overflow-x-auto border-t border-sam-border">
          <table className="min-w-[960px] w-full border-collapse sam-text-xxs text-sam-muted">
            <thead>
              <tr className="border-b border-sam-border text-left">
                {ruleStatsHeaders.map((key) => (
                  <th key={key} className="py-2 px-2 font-medium">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ruleStats.map((r) => (
                <tr key={r.rule_id} className="border-b border-sam-border/60">
                  <td className="py-2 px-2 text-sam-fg">
                    <div className="font-medium">{r.rule_name || (ko ? "이름 없는 규칙" : "Unnamed rule")}</div>
                    <AdminTechDetails ko={ko}>{r.rule_key}</AdminTechDetails>
                  </td>
                  <td className="py-2 px-2">{r.dangerous ? t("admin_del_alert_yes") : dash}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.actions_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.success_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.failed_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.rejected_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.pending_open)}</td>
                  <td className="py-2 px-2 tabular-nums">
                    {r.avg_approval_wait_minutes_today == null ? dash : String(r.avg_approval_wait_minutes_today)}
                  </td>
                  <td className="py-2 px-2 tabular-nums">
                    {r.avg_retry_today == null ? dash : String(r.avg_retry_today)}
                  </td>
                </tr>
              ))}
              {!loading && ruleStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sam-muted">
                    {t("admin_del_alert_empty_auto_rules_stats")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/delivery-alerts" className="sam-btn sam-btn--outline sam-btn--sm">
          {t("admin_del_alert_back_to_alerts")}
        </Link>
        <div className="inline-flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs">
          <span className="text-sam-muted">{ko ? "자동 조치:" : "Auto actions:"}</span>
          <strong className={killOn ? "text-sam-fg" : "text-sam-warning"}>
            {!settingsLoaded
              ? settingsErr
                ? t("admin_r4d_unavailable")
                : dash
              : killOn
                ? ko
                  ? "실행 허용"
                  : "Allowed"
                : ko
                  ? "전체 중지됨"
                  : "All stopped"}
          </strong>
          <AdminActionButton
            variant={killOn ? "danger" : "primary"}
            size="sm"
            disabled={!settingsLoaded || killBusy}
            onClick={() => void toggleKill(!killOn)}
          >
            {killOn
                ? ko
                  ? "자동 조치 전체 중지"
                  : "Stop all auto actions"
                : ko
                  ? "자동 조치 다시 허용"
                  : "Allow auto actions"}
          </AdminActionButton>
        </div>
        <span className="text-sam-muted sam-text-xxs" data-auto-actions-authority="delivery_auto_actions_runtime_settings">
          {t("admin_r4d_auto_authority_note")}
        </span>
      </div>

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {loadErr ? (
        loadErr.status === 503 ? (
          <div role="alert" className="rounded-ui-rect border border-sam-warning/20 bg-sam-warning-soft px-4 py-3 text-sam-warning sam-text-body-secondary">
            {t("admin_r4d_auto_not_ready")}
          </div>
        ) : (
          <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={() => loadData()} />
        )
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-sam-fg">{t("admin_r4d_auto_bulk_title")}</span>
          <span className="text-sam-muted">{t("admin_r4d_auto_bulk_hint")}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {AUTO_BULK_ACTIONS.map((b) => (
            <AdminActionButton
              key={b.action}
              type="button"
              variant="secondary" size="sm"
              disabled={bulkBusy || busyId !== null}
              onClick={() => void runBulk(b.action, t(b.labelKey))}
            >
              {t(b.labelKey)}
            </AdminActionButton>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <AdminChipButton
            key={f}
            type="button"
            selected={filterStatus === f}
            onClick={() => setFilterStatus(f)}
          >
            {filterStatusLabel(f)}
          </AdminChipButton>
        ))}
        <AdminChipButton
          type="button"
          selected={dangerousOnly}
          onClick={() => setDangerousOnly((v) => !v)}
        >
          {t("admin_del_alert_filter_dangerous_only")}
        </AdminChipButton>
        <AdminChipButton
          type="button"
          selected={retryOnly}
          onClick={() => setRetryOnly((v) => !v)}
        >
          {t("admin_del_alert_filter_retry_only")}
        </AdminChipButton>
        <AdminChipButton
          type="button"
          selected={todayOnly}
          onClick={() => setTodayOnly((v) => !v)}
        >
          {t("admin_del_alert_filter_today_utc")}
        </AdminChipButton>
        <select
          className="sam-input h-8 min-w-[160px] sam-text-xxs"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
        >
          <option value="">{t("admin_del_alert_rule_all")}</option>
          {rulePicklist.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rule_name || r.rule_key}
            </option>
          ))}
        </select>
        <AdminActionButton type="button" variant="secondary" size="sm" onClick={() => loadData()} disabled={loading}>
          {t("admin_del_common_refresh")}
        </AdminActionButton>
      </div>

      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="min-w-[1100px] w-full border-collapse sam-text-xxs text-sam-muted">
          <thead>
            <tr className="border-b border-sam-border text-left">
              {actionTableHeaders.map((key) => (
                <th key={key} className="py-2 px-2 font-medium">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr
                key={a.id}
                className={`border-b border-sam-border/60 align-top ${
                  a.stale_pending ? "bg-sam-warning-soft/40" : ""
                }`}
              >
                <td className="py-2 px-2 whitespace-nowrap tabular-nums">
                  {a.executed_at ? formatAdminManilaDateTime(a.executed_at) : dash}
                  {a.stale_pending ? (
                    <div className="text-[12px] text-sam-warning">{t("admin_del_alert_stale_pending_badge")}</div>
                  ) : null}
                  {a.dangerous_action ? (
                    <div className="text-[12px] text-sam-muted">{t("admin_del_alert_dangerous_badge")}</div>
                  ) : null}
                </td>
                <td className="py-2 px-2 text-sam-fg">
                  <div className="font-medium">{a.rule_name || "—"}</div>
                  {a.rule_key ? <AdminTechDetails ko={ko}>{a.rule_key}</AdminTechDetails> : null}
                </td>
                <td className="py-2 px-2 text-[12px] text-sam-fg">
                  {AUTO_ACTION_TYPE_KEYS[a.action_type] ? t(AUTO_ACTION_TYPE_KEYS[a.action_type]) : dash}
                </td>
                <td className="py-2 px-2">{adminStatusLabel("auto_action", a.action_status, ko).label}</td>
                <td className="py-2 px-2 max-w-[220px]">
                  <span className="line-clamp-2">{a.result_message ?? "—"}</span>
                </td>
                <td className="py-2 px-2 tabular-nums">
                  {a.retry_count ?? 0}/{a.max_retries ?? 3}
                </td>
                <td className="py-2 px-2">
                  {a.admin_order_url ? (
                    <Link href={a.admin_order_url} className="text-signature underline">
                      {a.order_no || (ko ? "주문 상세" : "Order detail")}
                    </Link>
                  ) : (
                    dash
                  )}
                </td>
                <td className="py-2 px-2">
                  {a.action_status === "pending_approval" ? (
                    <div className="flex flex-col gap-1">
                      <input
                        className="sam-input h-7 text-[12px]"
                        placeholder={t("admin_del_alert_ph_memo")}
                        value={memo[a.id] ?? ""}
                        disabled={busyId === a.id}
                        onChange={(e) => setMemo((m) => ({ ...m, [a.id]: e.target.value }))}
                      />
                      <div className="flex gap-1">
                        <AdminActionButton
                          type="button"
                          variant="primary" size="sm"
                          disabled={busyId !== null}
                          onClick={() => void postAction(a, "approve")}
                        >
                          {t("admin_del_alert_btn_approve")}
                        </AdminActionButton>
                        <AdminActionButton
                          type="button"
                          variant="secondary" size="sm"
                          disabled={busyId !== null}
                          onClick={() => void postAction(a, "reject")}
                        >
                          {t("admin_del_alert_btn_reject")}
                        </AdminActionButton>
                      </div>
                    </div>
                  ) : a.action_status === "failed" ? (
                    <AdminActionButton
                      type="button"
                      variant="secondary" size="sm"
                      disabled={busyId !== null || (a.retry_count ?? 0) >= (a.max_retries ?? 3)}
                      onClick={() => void postAction(a, "retry")}
                    >
                      {ko ? "자동 조치 재실행" : "Re-run auto action"}
                    </AdminActionButton>
                  ) : (
                    <span className="text-sam-muted">{dash}</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && actions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sam-muted">
                  {t("admin_del_alert_empty_auto_actions")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-xxs text-sam-muted">
        <summary className="cursor-pointer text-sam-fg">{t("admin_del_alert_metadata_summary")}</summary>
        <ul className="mt-2 space-y-2 font-mono text-[12px]">
          {actions.slice(0, 5).map((a) => (
            <li key={`meta-${a.id}`} className="break-all">
              <span className="text-sam-fg">{a.id}</span> {JSON.stringify(a.metadata ?? {})}
            </li>
          ))}
        </ul>
      </details>

      {dashboard?.generated_at ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          {t("admin_r4d_generated_at", { at: formatAdminManilaDateTime(String(dashboard.generated_at)) })}
        </div>
      ) : null}
    </div>
  );
}

