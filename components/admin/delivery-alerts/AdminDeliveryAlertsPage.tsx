"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DeliveryAlertLogTimeline } from "@/components/admin/delivery-alerts/DeliveryAlertLogTimeline";
import { AUTO_ACTION_TYPE_KEYS } from "@/components/admin/i18n/admin-delivery-alerts-label-keys";
import { fetchAdminDeliveryOperationAlertsDeduped } from "@/lib/admin/fetch-admin-delivery-operation-alerts-deduped";

type RuleRow = {
  id: string;
  rule_key: string;
  rule_name: string;
  threshold_minutes: number;
  repeat_minutes: number;
  is_active: boolean;
  warning_level: string;
  escalation_level: number;
  escalate_after_minutes?: number;
  max_escalation_level?: number;
  notify_admin: boolean;
  auto_action_enabled?: boolean;
  auto_action_type?: string | null;
  auto_action_delay_minutes?: number | null;
  auto_action_min_escalation_count?: number;
  auto_action_requires_approval?: boolean;
};

const AUTO_ACTION_VALUES = [
  "",
  "auto_hold_settlement",
  "auto_flag_order",
  "auto_reassign_rider",
  "auto_escalate",
  "auto_assign_admin",
  "auto_mark_attention",
  "auto_mute",
] as const;

type Summary = {
  mine_open: number;
  unassigned_open: number;
  escalated_active: number;
  today_resolved_mine: number;
  avg_handle_minutes_today_mine: number | null;
};

type OperatorRow = { id: string; nickname: string; username: string; role: string };

type EventRow = {
  id: string;
  rule_id: string;
  order_id: string | null;
  store_id: string | null;
  severity: string;
  event_status: string;
  first_triggered_at: string;
  last_triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  assigned_admin_id?: string | null;
  assigned_at?: string | null;
  assignment_note?: string | null;
  escalation_count?: number;
  escalated_at?: string | null;
  handling_note?: string | null;
  acknowledge_note?: string | null;
  resolve_note?: string | null;
  mute_note?: string | null;
  repeat_fire_count?: number;
  rule: RuleRow | null;
  store_name: string;
  order_no: string;
  assigned_label?: string;
};

function parsePayload(json: unknown): { rules: RuleRow[]; events: EventRow[]; summary: Summary } | null {
  if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const rules = Array.isArray(o.rules) ? o.rules : [];
  const events = Array.isArray(o.events) ? o.events : [];
  const s = o.summary;
  const summary: Summary =
    s != null && typeof s === "object" && !Array.isArray(s)
      ? {
          mine_open: Number((s as Record<string, unknown>).mine_open ?? 0),
          unassigned_open: Number((s as Record<string, unknown>).unassigned_open ?? 0),
          escalated_active: Number((s as Record<string, unknown>).escalated_active ?? 0),
          today_resolved_mine: Number((s as Record<string, unknown>).today_resolved_mine ?? 0),
          avg_handle_minutes_today_mine:
            (s as Record<string, unknown>).avg_handle_minutes_today_mine == null
              ? null
              : Number((s as Record<string, unknown>).avg_handle_minutes_today_mine),
        }
      : {
          mine_open: 0,
          unassigned_open: 0,
          escalated_active: 0,
          today_resolved_mine: 0,
          avg_handle_minutes_today_mine: null,
        };
  return {
    rules: rules.filter((x): x is RuleRow => x != null && typeof x === "object"),
    events: events.filter((x): x is EventRow => x != null && typeof x === "object"),
    summary,
  };
}

export function AdminDeliveryAlertsPage() {
  const { t } = useI18n();
  const dash = t("admin_del_common_dash");

  const elapsedLabel = useCallback(
    (fromIso: string): string => {
      const ts = Date.parse(fromIso);
      if (!Number.isFinite(ts)) return dash;
      const ms = Date.now() - ts;
      const m = Math.floor(ms / 60000);
      if (m < 60) return t("admin_del_alert_elapsed_min", { n: m });
      const h = Math.floor(m / 60);
      if (h < 48) return t("admin_del_alert_elapsed_hour", { n: h });
      const d = Math.floor(h / 24);
      return t("admin_del_alert_elapsed_day", { n: d });
    },
    [t, dash]
  );

  const summaryCards = useMemo(
    () =>
      [
        { key: "admin_del_alert_kpi_mine_open" as const, value: (s: Summary) => s.mine_open },
        { key: "admin_del_alert_kpi_unassigned_open" as const, value: (s: Summary) => s.unassigned_open },
        { key: "admin_del_alert_kpi_escalated" as const, value: (s: Summary) => s.escalated_active },
        { key: "admin_del_alert_kpi_today_resolved" as const, value: (s: Summary) => s.today_resolved_mine },
        {
          key: "admin_del_alert_kpi_avg_handle_min" as const,
          value: (s: Summary) =>
            s.avg_handle_minutes_today_mine == null ? dash : String(s.avg_handle_minutes_today_mine),
        },
      ],
    [dash]
  );

  const ruleTableHeaders = useMemo(
    () =>
      [
        "admin_del_alert_th_key",
        "admin_del_alert_th_name",
        "admin_del_alert_th_threshold",
        "admin_del_alert_th_repeat",
        "admin_del_alert_th_escalate_after",
        "admin_del_alert_th_max_level",
        "admin_del_alert_th_display_level",
        "admin_del_alert_th_auto_action",
        "admin_del_alert_th_auto_delay",
        "admin_del_alert_th_auto_min_esc",
        "admin_del_alert_th_instant",
        "admin_del_alert_th_active",
      ] as const,
    []
  );

  const eventTableHeaders = useMemo(
    () =>
      [
        "admin_del_alert_th_log",
        "admin_del_alert_th_kind",
        "admin_del_alert_th_order",
        "admin_del_alert_th_store",
        "admin_del_alert_th_assignee",
        "admin_del_alert_th_status",
        "admin_del_alert_th_severity",
        "admin_del_alert_th_escal",
        "admin_del_alert_th_repeat_count",
        "admin_del_alert_th_elapsed",
        "admin_del_alert_th_handling",
      ] as const,
    []
  );

  const [filter, setFilter] = useState<"open" | "all">("open");
  const [assignment, setAssignment] = useState<"all" | "mine" | "unassigned">("all");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    mine_open: 0,
    unassigned_open: 0,
    escalated_active: 0,
    today_resolved_mine: 0,
    avg_handle_minutes_today_mine: null,
  });
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ruleBusyId, setRuleBusyId] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [assignPick, setAssignPick] = useState<Record<string, string>>({});
  const [assignMemo, setAssignMemo] = useState<Record<string, string>>({});
  const [logPanelOpen, setLogPanelOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void fetch("/api/admin/delivery-operation-alerts/operators", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.operators) ? d.operators : [];
        setOperators(list.filter((x: unknown): x is OperatorRow => x != null && typeof x === "object"));
      })
      .catch(() => setOperators([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    void fetchAdminDeliveryOperationAlertsDeduped(filter, assignment).then(({ status, json }) => {
      const parsed = parsePayload(json);
      if (status === 200 && parsed) {
        setRules(parsed.rules);
        setEvents(parsed.events);
        setSummary(parsed.summary);
        setError(null);
        setLoading(false);
        return;
      }
      setRules([]);
      setEvents([]);
      setError(
        status === 503 ? t("admin_del_alert_err_schema") : t("admin_del_alert_err_load_status", { status })
      );
      setLoading(false);
    });
  }, [filter, assignment, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const runSync = useCallback(() => {
    void fetch("/api/admin/delivery-operation-alerts/sync", { method: "POST", cache: "no-store" }).then(async (res) => {
      if (!res.ok) {
        setError(t("admin_del_alert_err_sync_status", { status: res.status }));
        return;
      }
      load();
    });
  }, [load, t]);

  const patchEventJson = useCallback(
    (eventId: string, body: Record<string, unknown>) => {
      setBusyId(eventId);
      void fetch(`/api/admin/delivery-operation-alerts/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            const msg = j && typeof j === "object" && j != null && "error" in j ? String((j as { error?: unknown }).error) : "";
            setError(msg || t("admin_del_alert_err_action_status", { status: res.status }));
            return;
          }
          load();
        })
        .finally(() => setBusyId(null));
    },
    [load, t]
  );

  const patchRule = useCallback(
    (
      ruleId: string,
      patch: Partial<
        Pick<
          RuleRow,
          | "is_active"
          | "threshold_minutes"
          | "repeat_minutes"
          | "escalate_after_minutes"
          | "max_escalation_level"
          | "auto_action_enabled"
          | "auto_action_type"
          | "auto_action_delay_minutes"
          | "auto_action_min_escalation_count"
          | "auto_action_requires_approval"
        >
      >
    ) => {
      setRuleBusyId(ruleId);
      void fetch(`/api/admin/delivery-operation-alerts/rules/${encodeURIComponent(ruleId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then(async (res) => {
          if (!res.ok) {
            setError(t("admin_del_alert_err_rule_save_status", { status: res.status }));
            return;
          }
          load();
        })
        .finally(() => setRuleBusyId(null));
    },
    [load, t]
  );

  const rowStress = (ev: EventRow) =>
    ev.severity === "critical" || (typeof ev.escalation_count === "number" && ev.escalation_count > 0);

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        titleKey="admin_del_alert_page_title"
        descriptionKey="admin_del_alert_page_desc"
      />

      {error ? (
        <div className="rounded-ui-rect border border-sam-warning/20 bg-sam-warning-soft px-4 py-3 text-sam-warning sam-text-body-secondary" role="alert">
          {error}
          <button type="button" className="sam-btn sam-btn--outline sam-btn--sm ml-3" onClick={() => setError(null)}>
            {t("common_close")}
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {summaryCards.map((c) => (
          <div key={c.key} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
            <p className="sam-text-xxs text-sam-muted">{t(c.key)}</p>
            <p className="tabular-nums font-semibold text-sam-fg">{loading ? "…" : c.value(summary)}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`sam-btn sam-btn--sm ${filter === "open" ? "sam-btn--primary" : "sam-btn--outline"}`}
            onClick={() => setFilter("open")}
          >
            {t("admin_del_alert_filter_open")}
          </button>
          <button
            type="button"
            className={`sam-btn sam-btn--sm ${filter === "all" ? "sam-btn--primary" : "sam-btn--outline"}`}
            onClick={() => setFilter("all")}
          >
            {t("common_all")}
          </button>
          <span className="mx-1 hidden text-sam-muted sm:inline">|</span>
          <button
            type="button"
            className={`sam-btn sam-btn--sm ${assignment === "all" ? "sam-btn--primary" : "sam-btn--outline"}`}
            onClick={() => setAssignment("all")}
          >
            {t("admin_del_alert_filter_assign_all")}
          </button>
          <button
            type="button"
            className={`sam-btn sam-btn--sm ${assignment === "mine" ? "sam-btn--primary" : "sam-btn--outline"}`}
            onClick={() => setAssignment("mine")}
          >
            {t("admin_del_alert_filter_assign_mine")}
          </button>
          <button
            type="button"
            className={`sam-btn sam-btn--sm ${assignment === "unassigned" ? "sam-btn--primary" : "sam-btn--outline"}`}
            onClick={() => setAssignment("unassigned")}
          >
            {t("admin_del_alert_filter_assign_unassigned")}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/delivery-auto-actions" className="sam-btn sam-btn--outline sam-btn--sm">
            {t("admin_del_alert_link_auto_actions")}
          </Link>
          <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" onClick={runSync} disabled={loading}>
            {t("admin_del_alert_btn_sync_now")}
          </button>
          <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" onClick={() => load()} disabled={loading}>
            {t("admin_del_common_refresh")}
          </button>
        </div>
      </div>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_alert_section_rules")}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[1260px] w-full border-collapse sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                {ruleTableHeaders.map((key) => (
                  <th
                    key={key}
                    className="py-2 pr-2 font-medium"
                    title={key === "admin_del_alert_th_instant" ? t("admin_del_alert_title_instant_exec") : undefined}
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((ru) => (
                <tr key={ru.id} className="border-b border-sam-border/70">
                  <td className="py-2 pr-2 font-mono text-xs text-sam-muted">{ru.rule_key}</td>
                  <td className="py-2 pr-2 text-sam-fg">{ru.rule_name}</td>
                  <td className="py-2 pr-2">
                    <input
                      key={`${ru.id}-thr-${ru.threshold_minutes}`}
                      type="number"
                      className="sam-input h-8 w-20 text-sm"
                      defaultValue={ru.threshold_minutes}
                      disabled={ruleBusyId === ru.id}
                      onBlur={(ev) => {
                        const n = Math.floor(Number(ev.target.value));
                        if (!Number.isFinite(n) || n < 1) return;
                        if (n !== ru.threshold_minutes) patchRule(ru.id, { threshold_minutes: n });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      key={`${ru.id}-rep-${ru.repeat_minutes}`}
                      type="number"
                      className="sam-input h-8 w-20 text-sm"
                      defaultValue={ru.repeat_minutes}
                      disabled={ruleBusyId === ru.id}
                      onBlur={(ev) => {
                        const n = Math.floor(Number(ev.target.value));
                        if (!Number.isFinite(n) || n < 1) return;
                        if (n !== ru.repeat_minutes) patchRule(ru.id, { repeat_minutes: n });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      key={`${ru.id}-esc-${ru.escalate_after_minutes ?? 30}`}
                      type="number"
                      className="sam-input h-8 w-20 text-sm"
                      defaultValue={ru.escalate_after_minutes ?? 30}
                      disabled={ruleBusyId === ru.id}
                      onBlur={(ev) => {
                        const n = Math.floor(Number(ev.target.value));
                        if (!Number.isFinite(n) || n < 1) return;
                        if (n !== (ru.escalate_after_minutes ?? 30)) patchRule(ru.id, { escalate_after_minutes: n });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      key={`${ru.id}-max-${ru.max_escalation_level ?? 3}`}
                      type="number"
                      className="sam-input h-8 w-16 text-sm"
                      defaultValue={ru.max_escalation_level ?? 3}
                      disabled={ruleBusyId === ru.id}
                      onBlur={(ev) => {
                        const n = Math.floor(Number(ev.target.value));
                        if (!Number.isFinite(n) || n < 1) return;
                        if (n !== (ru.max_escalation_level ?? 3)) patchRule(ru.id, { max_escalation_level: n });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{ru.escalation_level}</td>
                  <td className="py-2 pr-2">
                    <select
                      className="sam-input h-8 max-w-[9.5rem] text-xs"
                      disabled={ruleBusyId === ru.id}
                      value={ru.auto_action_enabled && ru.auto_action_type ? ru.auto_action_type : ""}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        if (!v) {
                          patchRule(ru.id, { auto_action_enabled: false });
                          return;
                        }
                        patchRule(ru.id, {
                          auto_action_enabled: true,
                          auto_action_type: v,
                          auto_action_delay_minutes: ru.auto_action_delay_minutes ?? 60,
                          auto_action_min_escalation_count: ru.auto_action_min_escalation_count ?? 0,
                          auto_action_requires_approval:
                            v === "auto_hold_settlement" || v === "auto_reassign_rider" || v === "auto_mute"
                              ? true
                              : (ru.auto_action_requires_approval ?? false),
                        });
                      }}
                    >
                      {AUTO_ACTION_VALUES.map((value) => (
                        <option key={value || "off"} value={value}>
                          {t(AUTO_ACTION_TYPE_KEYS[value] ?? "admin_del_alert_auto_off")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      key={`${ru.id}-aad-${ru.auto_action_delay_minutes ?? ""}`}
                      type="number"
                      className="sam-input h-8 w-16 text-sm"
                      defaultValue={ru.auto_action_delay_minutes ?? ""}
                      disabled={ruleBusyId === ru.id || !ru.auto_action_enabled}
                      title={t("admin_del_alert_title_auto_delay_from_first")}
                      onBlur={(ev) => {
                        const n = Math.floor(Number(ev.target.value));
                        if (!Number.isFinite(n) || n < 1) return;
                        if (n !== (ru.auto_action_delay_minutes ?? null)) patchRule(ru.id, { auto_action_delay_minutes: n });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      key={`${ru.id}-aam-${ru.auto_action_min_escalation_count ?? 0}`}
                      type="number"
                      className="sam-input h-8 w-14 text-sm"
                      defaultValue={ru.auto_action_min_escalation_count ?? 0}
                      disabled={ruleBusyId === ru.id || !ru.auto_action_enabled}
                      title={t("admin_del_alert_title_min_escalation")}
                      onBlur={(ev) => {
                        const n = Math.floor(Number(ev.target.value));
                        if (!Number.isFinite(n) || n < 0) return;
                        if (n !== (ru.auto_action_min_escalation_count ?? 0)) {
                          patchRule(ru.id, { auto_action_min_escalation_count: n });
                        }
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 sam-text-xxs">
                      <input
                        type="checkbox"
                        checked={ru.auto_action_requires_approval === false}
                        disabled={
                          ruleBusyId === ru.id ||
                          !ru.auto_action_enabled ||
                          ru.auto_action_type === "auto_hold_settlement" ||
                          ru.auto_action_type === "auto_reassign_rider" ||
                          ru.auto_action_type === "auto_mute"
                        }
                        title={t("admin_del_alert_title_risk_requires_approval")}
                        onChange={(ev) =>
                          patchRule(ru.id, { auto_action_requires_approval: !ev.target.checked })
                        }
                      />
                    </label>
                  </td>
                  <td className="py-2 pr-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 sam-text-xxs">
                      <input
                        type="checkbox"
                        checked={ru.is_active}
                        disabled={ruleBusyId === ru.id}
                        onChange={(ev) => patchRule(ru.id, { is_active: ev.target.checked })}
                      />
                      {t("admin_del_alert_state_on")}
                    </label>
                  </td>
                </tr>
              ))}
              {!loading && rules.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-sam-muted">
                    {t("admin_del_alert_empty_rules")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_del_alert_section_events")}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full border-collapse sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                {eventTableHeaders.map((key) => (
                  <th key={key} className={`py-2 pr-2 font-medium${key === "admin_del_alert_th_log" ? " w-24" : ""}`}>
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr
                  key={ev.id}
                  className={`border-b border-sam-border/70 align-top ${rowStress(ev) ? "bg-sam-warning-soft/25" : ""}`}
                >
                  <td className="py-2 pr-2 align-top">
                    <details
                      className="max-w-[14rem]"
                      onToggle={(e) => {
                        const open = e.currentTarget.open;
                        setLogPanelOpen((p) => ({ ...p, [ev.id]: open }));
                      }}
                    >
                      <summary className="cursor-pointer text-signature underline sam-text-xxs">{t("admin_del_alert_timeline")}</summary>
                      {logPanelOpen[ev.id] ? (
                        <div className="mt-2 max-h-64 overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface-muted/30 p-2">
                          <DeliveryAlertLogTimeline eventId={ev.id} />
                        </div>
                      ) : null}
                    </details>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="font-medium text-sam-fg">{ev.rule?.rule_name ?? ev.rule?.rule_key ?? dash}</span>
                  </td>
                  <td className="py-2 pr-2">
                    {ev.order_id ? (
                      <Link
                        href={`/admin/store-orders?order_id=${encodeURIComponent(ev.order_id)}`}
                        className="text-signature underline sam-text-xxs"
                      >
                        {ev.order_no || ev.order_id.slice(0, 8)}
                      </Link>
                    ) : (
                      dash
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {ev.store_id ? (
                      <Link
                        href={`/admin/stores/orders/by-store/${encodeURIComponent(ev.store_id)}`}
                        className="block max-w-[8rem] truncate text-signature underline sam-text-xxs"
                        title={ev.store_name}
                      >
                        {ev.store_name || ev.store_id.slice(0, 8)}
                      </Link>
                    ) : (
                      dash
                    )}
                  </td>
                  <td className="py-2 pr-2 sam-text-xxs">
                    <div className="max-w-[10rem]">{ev.assigned_label || dash}</div>
                    {ev.event_status !== "resolved" ? (
                      <div className="mt-1 flex flex-col gap-1">
                        <select
                          className="sam-input h-8 max-w-[10rem] text-xxs"
                          value={assignPick[ev.id] ?? ""}
                          onChange={(e) => setAssignPick((p) => ({ ...p, [ev.id]: e.target.value }))}
                        >
                          <option value="">{t("admin_del_alert_select_assignee")}</option>
                          {operators.map((op) => (
                            <option key={op.id} value={op.id}>
                              {(op.nickname || op.username || op.id).slice(0, 24)}
                            </option>
                          ))}
                        </select>
                        <input
                          className="sam-input h-8 max-w-[10rem] text-xxs"
                          placeholder={t("admin_del_alert_ph_assign_memo")}
                          value={assignMemo[ev.id] ?? ""}
                          onChange={(e) => setAssignMemo((m) => ({ ...m, [ev.id]: e.target.value }))}
                        />
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="sam-btn sam-btn--outline sam-btn--sm"
                            disabled={busyId === ev.id || !assignPick[ev.id]}
                            onClick={() =>
                              patchEventJson(ev.id, {
                                action: "assign",
                                assigned_admin_id: assignPick[ev.id],
                                assignment_note: assignMemo[ev.id] || undefined,
                              })
                            }
                          >
                            {t("admin_del_alert_btn_assign")}
                          </button>
                          <button
                            type="button"
                            className="sam-btn sam-btn--outline sam-btn--sm"
                            disabled={busyId === ev.id || !ev.assigned_admin_id}
                            onClick={() => patchEventJson(ev.id, { action: "unassign" })}
                          >
                            {t("admin_del_alert_btn_unassign")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">{ev.event_status}</td>
                  <td className="py-2 pr-2 font-medium">{ev.severity}</td>
                  <td className="py-2 pr-2 tabular-nums">{ev.escalation_count ?? 0}</td>
                  <td className="py-2 pr-2 tabular-nums">{ev.repeat_fire_count ?? 0}</td>
                  <td className="py-2 pr-2 tabular-nums">{elapsedLabel(ev.first_triggered_at)}</td>
                  <td className="py-2 pr-2">
                    <input
                      className="sam-input mb-1 h-8 w-full min-w-[8rem] text-xxs"
                      placeholder={t("admin_del_alert_ph_action_note")}
                      value={actionNotes[ev.id] ?? ""}
                      onChange={(e) => setActionNotes((n) => ({ ...n, [ev.id]: e.target.value }))}
                    />
                    {ev.event_status !== "resolved" ? (
                      <input
                        className="sam-input mb-1 h-8 w-full min-w-[8rem] text-xxs"
                        placeholder={t("admin_del_alert_ph_handling_note")}
                        defaultValue={ev.handling_note ?? ""}
                        key={`hand-${ev.id}-${ev.handling_note ?? ""}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (!v || v === (ev.handling_note ?? "").trim()) return;
                          patchEventJson(ev.id, { action: "handling", handling_note: v });
                        }}
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="sam-btn sam-btn--outline sam-btn--sm"
                        disabled={busyId === ev.id || ev.event_status !== "open"}
                        onClick={() =>
                          patchEventJson(ev.id, { action: "acknowledge", note: actionNotes[ev.id] || undefined })
                        }
                      >
                        {t("admin_del_alert_btn_acknowledge")}
                      </button>
                      <button
                        type="button"
                        className="sam-btn sam-btn--outline sam-btn--sm"
                        disabled={busyId === ev.id || (ev.event_status !== "open" && ev.event_status !== "acknowledged")}
                        onClick={() =>
                          patchEventJson(ev.id, { action: "mute", note: actionNotes[ev.id] || undefined })
                        }
                      >
                        {t("admin_del_alert_btn_mute")}
                      </button>
                      <button
                        type="button"
                        className="sam-btn sam-btn--primary sam-btn--sm"
                        disabled={busyId === ev.id || ev.event_status === "resolved"}
                        onClick={() =>
                          patchEventJson(ev.id, { action: "resolve", note: actionNotes[ev.id] || undefined })
                        }
                      >
                        {t("admin_del_alert_btn_resolve")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && events.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-sam-muted">
                    {t("admin_del_alert_empty_events")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
