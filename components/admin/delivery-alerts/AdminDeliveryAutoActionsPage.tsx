"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { resolveDeliveryAlertBannerLabel } from "@/components/admin/i18n/admin-delivery-alerts-label-keys";

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

function stabilityPercent(d: DashboardPayload | null): number {
  if (!d?.kpi) return 0;
  let s = 100;
  if (d.dangerous_instant_misconfigured) s -= 28;
  if (num(d.kpi.pending_stale_30m) > 0) s -= 18;
  if (num(d.kpi.retry_needed) > 0) s -= 12;
  if (num(d.kpi.today_failed) > 0) s -= 8;
  if (d.cron_suspect_stale_ratio) s -= 12;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function AdminDeliveryAutoActionsPage() {
  const { t } = useI18n();
  const dash = t("admin_del_common_dash");
  const [killOn, setKillOn] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [rulePicklist, setRulePicklist] = useState<RulePick[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [ruleId, setRuleId] = useState<string>("");
  const [dangerousOnly, setDangerousOnly] = useState(false);
  const [retryOnly, setRetryOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<Record<string, string>>({});

  const loadSettings = useCallback(() => {
    void fetch("/api/admin/delivery-auto-actions/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const on = Boolean(d?.settings?.delivery_auto_actions_enabled);
        setKillOn(on);
        setSettingsLoaded(true);
      })
      .catch(() => {
        setSettingsLoaded(true);
        setKillOn(false);
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
          setError(
            r.status === 503 ? t("admin_del_alert_err_schema") : t("admin_del_alert_err_list_status", { status: r.status })
          );
          setActions([]);
          setDashboard(null);
          setLoading(false);
          return;
        }
        const list = Array.isArray(j?.actions) ? j.actions : [];
        setActions(list.filter((x: unknown): x is ActionRow => x != null && typeof x === "object"));
        const dash = j?.dashboard && typeof j.dashboard === "object" ? (j.dashboard as DashboardPayload) : null;
        setDashboard(dash);
        if (dash && typeof dash.kill_switch_on === "boolean") {
          setKillOn(dash.kill_switch_on);
        }
        const pick = Array.isArray(dash?.rule_picklist) ? (dash!.rule_picklist as RulePick[]) : [];
        setRulePicklist(pick.filter((x) => x && typeof x.id === "string"));
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        setError(t("admin_del_alert_err_list_failed"));
        setLoading(false);
      });
  }, [buildQuery, t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleKill = useCallback(
    (next: boolean) => {
      void fetch("/api/admin/delivery-auto-actions/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivery_auto_actions_enabled: next }),
      }).then(async (r) => {
        if (!r.ok) {
          setError(t("admin_del_alert_err_settings_save_status", { status: r.status }));
          return;
        }
        setKillOn(next);
        setError(null);
        loadData();
      });
    },
    [loadData, t]
  );

  const postAction = useCallback(
    (actionId: string, path: "approve" | "reject" | "retry") => {
      setBusyId(actionId);
      const note = (memo[actionId] ?? "").trim();
      const body = path === "retry" ? undefined : JSON.stringify({ note: note || undefined });
      void fetch(`/api/admin/delivery-auto-actions/${encodeURIComponent(actionId)}/${path}`, {
        method: "POST",
        ...(path === "retry" ? {} : { headers: { "Content-Type": "application/json" }, body }),
      })
        .then(async (r) => {
          const j = await r.json().catch(() => null);
          if (!r.ok) {
            const err = j && typeof j === "object" && j != null && "error" in j ? String((j as { error?: unknown }).error) : "";
            setError(err || t("admin_del_alert_err_action_status", { status: r.status }));
            return;
          }
          setMemo((m) => ({ ...m, [actionId]: "" }));
          loadData();
        })
        .finally(() => setBusyId(null));
    },
    [memo, loadData, t]
  );

  const filterStatusLabel = useCallback(
    (f: string) => {
      if (f === "all") return t("common_all");
      if (f === "pending_approval") return t("admin_del_alert_filter_pending_approval");
      return f;
    },
    [t]
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
  const stab = stabilityPercent(dashboard);

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        titleKey="admin_del_alert_auto_page_title"
        descriptionKey="admin_del_alert_auto_page_desc"
      />

      {!dashboard ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          {t("admin_del_alert_rpc_missing_before")}{" "}
          <span className="font-mono text-[10px]">20260515120000_delivery_auto_actions_report_rpc</span>{" "}
          {t("admin_del_alert_rpc_missing_after")}
        </div>
      ) : null}

      {dashboard && !dashboard.dangerous_instant_misconfigured ? (
        <div className="rounded-ui-rect border border-sam-border/70 bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          {t("admin_del_alert_dangerous_policy_before")}
          <span className="font-mono">auto_hold_settlement</span>
          {t("admin_del_alert_dangerous_policy_mid")}
          <span className="font-mono">auto_reassign_rider</span>
          {t("admin_del_alert_dangerous_policy_mid")}
          <span className="font-mono">auto_mute</span>
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
            {t("admin_del_alert_kpi_auto_exec")}{" "}
            <strong className="text-sam-fg">{dashboard?.kill_switch_on ? t("admin_del_alert_state_on") : t("admin_del_alert_auto_off")}</strong>
          </span>
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
                    <div className="font-medium">{r.rule_name}</div>
                    <div className="font-mono text-[10px]">{r.rule_key}</div>
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
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs">
          <input
            type="checkbox"
            checked={killOn}
            disabled={!settingsLoaded}
            onChange={(e) => toggleKill(e.target.checked)}
          />
          <span className="text-sam-fg">{t("admin_del_alert_kill_switch_label")}</span>
        </label>
        <span className="text-sam-muted sam-text-xxs">{t("admin_del_alert_kill_switch_hint")}</span>
      </div>

      {error ? (
        <div className="rounded-ui-rect border border-sam-warning/20 bg-sam-warning-soft px-4 py-3 text-sam-warning sam-text-body-secondary">
          {error}
          <button type="button" className="sam-btn sam-btn--outline sam-btn--sm ml-2" onClick={() => setError(null)}>
            {t("common_close")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["all", "pending_approval", "success", "failed", "rejected"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`sam-btn sam-btn--sm ${filterStatus === f ? "sam-btn--primary" : "sam-btn--outline"}`}
            onClick={() => setFilterStatus(f)}
          >
            {filterStatusLabel(f)}
          </button>
        ))}
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${dangerousOnly ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setDangerousOnly((v) => !v)}
        >
          {t("admin_del_alert_filter_dangerous_only")}
        </button>
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${retryOnly ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setRetryOnly((v) => !v)}
        >
          {t("admin_del_alert_filter_retry_only")}
        </button>
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${todayOnly ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setTodayOnly((v) => !v)}
        >
          {t("admin_del_alert_filter_today_utc")}
        </button>
        <select
          className="sam-input h-8 min-w-[160px] sam-text-xxs"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
        >
          <option value="">{t("admin_del_alert_rule_all")}</option>
          {rulePicklist.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rule_key} · {r.rule_name}
            </option>
          ))}
        </select>
        <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" onClick={() => loadData()} disabled={loading}>
          {t("admin_del_common_refresh")}
        </button>
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
                  {a.executed_at?.slice(0, 19)?.replace("T", " ") ?? dash}
                  {a.stale_pending ? (
                    <div className="text-[10px] text-sam-warning">{t("admin_del_alert_stale_pending_badge")}</div>
                  ) : null}
                  {a.dangerous_action ? (
                    <div className="text-[10px] text-sam-muted">{t("admin_del_alert_dangerous_badge")}</div>
                  ) : null}
                </td>
                <td className="py-2 px-2 text-sam-fg">
                  <div className="font-medium">{a.rule_name || "—"}</div>
                  <div className="font-mono text-[10px] text-sam-muted">{a.rule_key}</div>
                </td>
                <td className="py-2 px-2 font-mono text-[11px] text-sam-fg">{a.action_type}</td>
                <td className="py-2 px-2">{a.action_status}</td>
                <td className="py-2 px-2 max-w-[220px]">
                  <span className="line-clamp-2">{a.result_message ?? "—"}</span>
                </td>
                <td className="py-2 px-2 tabular-nums">
                  {a.retry_count ?? 0}/{a.max_retries ?? 3}
                </td>
                <td className="py-2 px-2">
                  {a.admin_order_url ? (
                    <Link href={a.admin_order_url} className="text-signature underline">
                      {a.order_no || a.order_id?.slice(0, 8)}
                    </Link>
                  ) : (
                    dash
                  )}
                </td>
                <td className="py-2 px-2">
                  {a.action_status === "pending_approval" ? (
                    <div className="flex flex-col gap-1">
                      <input
                        className="sam-input h-7 text-[11px]"
                        placeholder={t("admin_del_alert_ph_memo")}
                        value={memo[a.id] ?? ""}
                        disabled={busyId === a.id}
                        onChange={(e) => setMemo((m) => ({ ...m, [a.id]: e.target.value }))}
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="sam-btn sam-btn--primary sam-btn--sm px-2 py-1 text-[11px]"
                          disabled={busyId === a.id}
                          onClick={() => postAction(a.id, "approve")}
                        >
                          {t("admin_del_alert_btn_approve")}
                        </button>
                        <button
                          type="button"
                          className="sam-btn sam-btn--outline sam-btn--sm px-2 py-1 text-[11px]"
                          disabled={busyId === a.id}
                          onClick={() => postAction(a.id, "reject")}
                        >
                          {t("admin_del_alert_btn_reject")}
                        </button>
                      </div>
                    </div>
                  ) : a.action_status === "failed" ? (
                    <button
                      type="button"
                      className="sam-btn sam-btn--outline sam-btn--sm px-2 py-1 text-[11px]"
                      disabled={busyId === a.id || (a.retry_count ?? 0) >= (a.max_retries ?? 3)}
                      onClick={() => postAction(a.id, "retry")}
                    >
                      {t("admin_del_alert_btn_retry")}
                    </button>
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
        <ul className="mt-2 space-y-2 font-mono text-[10px]">
          {actions.slice(0, 5).map((a) => (
            <li key={`meta-${a.id}`}>
              <span className="text-sam-fg">{a.id.slice(0, 8)}</span> {JSON.stringify(a.metadata ?? {})}
            </li>
          ))}
        </ul>
      </details>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
        {t("admin_del_alert_stability_score")} <strong className="text-sam-fg">{stab}%</strong>
        {dashboard?.generated_at ? (
          <span className="ml-2 font-mono text-[10px]">
            {t("admin_del_alert_generated_at")} {String(dashboard.generated_at).slice(0, 19).replace("T", " ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

