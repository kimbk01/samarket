"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DeliveryAlertLogTimeline } from "@/components/admin/delivery-alerts/DeliveryAlertLogTimeline";
import { AUTO_ACTION_TYPE_KEYS } from "@/components/admin/i18n/admin-delivery-alerts-label-keys";
import { fetchAdminDeliveryOperationAlertsDeduped } from "@/lib/admin/fetch-admin-delivery-operation-alerts-deduped";
import { invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import {
  AdminErrorState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";

type ResultState = { ok: true; message: string } | { ok: false; code: string } | null;

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
  /** CAS — 저장 시 expected_updated_at 로 보낸다 (DEF-41) */
  updated_at?: string | null;
};

/** C-9: `auto_hold_settlement`(레거시 정산 보류)는 중단 — 선택지에서 제외 (서버도 거부). */
const AUTO_ACTION_VALUES = [
  "",
  "auto_flag_order",
  "auto_reassign_rider",
  "auto_escalate",
  "auto_assign_admin",
  "auto_mark_attention",
  "auto_mute",
] as const;

/** 승인 없이 실행하면 위험한 자동 조치 — 항상 승인 필요. */
const RISKY_AUTO_ACTIONS = new Set(["auto_hold_settlement", "auto_reassign_rider", "auto_mute"]);

/** 규칙 편집 초안 — 저장 버튼을 누르기 전까지 서버에 보내지 않는다 (DEF-41). */
type RuleDraft = {
  threshold_minutes: string;
  repeat_minutes: string;
  escalate_after_minutes: string;
  max_escalation_level: string;
  auto_action_type: string;
  auto_action_delay_minutes: string;
  auto_action_min_escalation_count: string;
  instant: boolean;
  is_active: boolean;
};

function ruleToDraft(ru: RuleRow): RuleDraft {
  const type = ru.auto_action_enabled && ru.auto_action_type ? ru.auto_action_type : "";
  return {
    threshold_minutes: String(ru.threshold_minutes ?? ""),
    repeat_minutes: String(ru.repeat_minutes ?? ""),
    escalate_after_minutes: String(ru.escalate_after_minutes ?? 30),
    max_escalation_level: String(ru.max_escalation_level ?? 3),
    auto_action_type: type,
    auto_action_delay_minutes: ru.auto_action_delay_minutes == null ? "" : String(ru.auto_action_delay_minutes),
    auto_action_min_escalation_count: String(ru.auto_action_min_escalation_count ?? 0),
    instant: !!type && ru.auto_action_requires_approval === false,
    is_active: ru.is_active,
  };
}

function sameDraft(a: RuleDraft, b: RuleDraft): boolean {
  return (Object.keys(a) as (keyof RuleDraft)[]).every((k) => a[k] === b[k]);
}

function apiErr(status: number, j: unknown, fallback: string): string {
  const e = j != null && typeof j === "object" ? (j as { error?: unknown }).error : undefined;
  // 코드 형태(snake_case)만 사용 — DB 원문 메시지 등은 화면에 노출하지 않는다.
  if (typeof e === "string" && /^[a-z][a-z0-9_]*$/i.test(e.trim())) return e.trim();
  if (status === 403) return "forbidden";
  return fallback;
}

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

/** URL 필터 (`filter=open|all`, `assignment=all|mine|unassigned`) — 대시보드·상황판 링크가 그대로 열린다. */
function readFilter(sp: URLSearchParams): "open" | "all" {
  return sp.get("filter") === "all" ? "all" : "open";
}
function readAssignment(sp: URLSearchParams): "all" | "mine" | "unassigned" {
  const v = sp.get("assignment");
  return v === "mine" || v === "unassigned" ? v : "all";
}

export function AdminDeliveryAlertsPage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryAlertsPageInner />
    </Suspense>
  );
}

function AdminDeliveryAlertsPageInner() {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ko = language !== "en";
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

  const [filter, setFilterState] = useState<"open" | "all">(() =>
    readFilter(new URLSearchParams(searchParams.toString()))
  );
  const [assignment, setAssignmentState] = useState<"all" | "mine" | "unassigned">(() =>
    readAssignment(new URLSearchParams(searchParams.toString()))
  );
  const syncUrl = useCallback(
    (next: { filter?: "open" | "all"; assignment?: "all" | "mine" | "unassigned" }) => {
      const qs = new URLSearchParams(searchParams.toString());
      if (next.filter) {
        if (next.filter === "open") qs.delete("filter");
        else qs.set("filter", next.filter);
      }
      if (next.assignment) {
        if (next.assignment === "all") qs.delete("assignment");
        else qs.set("assignment", next.assignment);
      }
      const q = qs.toString();
      router.replace(`${pathname || "/admin/delivery-alerts"}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const setFilter = useCallback(
    (v: "open" | "all") => {
      setFilterState(v);
      syncUrl({ filter: v });
    },
    [syncUrl]
  );
  const setAssignment = useCallback(
    (v: "all" | "mine" | "unassigned") => {
      setAssignmentState(v);
      syncUrl({ assignment: v });
    },
    [syncUrl]
  );
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
  const [loadErr, setLoadErr] = useState<{ code: string; status?: number } | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [handlingDraft, setHandlingDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ruleBusyId, setRuleBusyId] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, RuleDraft>>({});
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
    // 처리·동기화 직후 재조회가 10초 GET 캐시의 이전 목록을 받지 않도록 매번 무효화한다.
    invalidateAdminFetchCache("admin:delivery-operation-alerts:");
    void fetchAdminDeliveryOperationAlertsDeduped(filter, assignment).then(({ status, json }) => {
      const parsed = parsePayload(json);
      if (status === 200 && parsed) {
        setRules(parsed.rules);
        setEvents(parsed.events);
        setSummary(parsed.summary);
        setLoadErr(null);
        setLoading(false);
        return;
      }
      setRules([]);
      setEvents([]);
      setLoadErr({ code: status === 503 ? "schema_missing" : apiErr(status, json, "load_failed"), status });
      setLoading(false);
    });
  }, [filter, assignment]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const runSync = useCallback(() => {
    setResult(null);
    void fetch("/api/admin/delivery-operation-alerts/sync", { method: "POST", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setResult({ ok: false, code: apiErr(res.status, j, "action_failed") });
          return;
        }
        setResult({ ok: true, message: t("admin_r4d_alert_sync_done") });
        load();
      })
      .catch(() => setResult({ ok: false, code: "network_error" }));
  }, [load, t]);

  /** 경고 처리 — 서버는 business 권한·상태 CAS(409)·감사 기록. 결과 배너 후 재조회. */
  const patchEventJson = useCallback(
    async (eventId: string, body: Record<string, unknown>, okMessage: string): Promise<boolean> => {
      setBusyId(eventId);
      setResult(null);
      try {
        const res = await fetch(`/api/admin/delivery-operation-alerts/events/${encodeURIComponent(eventId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setResult({ ok: false, code: apiErr(res.status, j, "action_failed") });
          load();
          return false;
        }
        setResult({ ok: true, message: okMessage });
        load();
        return true;
      } catch {
        setResult({ ok: false, code: "network_error" });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const draftFor = useCallback((ru: RuleRow): RuleDraft => ruleDrafts[ru.id] ?? ruleToDraft(ru), [ruleDrafts]);

  const editDraft = useCallback((ru: RuleRow, patch: Partial<RuleDraft>) => {
    setRuleDrafts((m) => {
      const cur = m[ru.id] ?? ruleToDraft(ru);
      const next = { ...cur, ...patch };
      if (!next.auto_action_type || RISKY_AUTO_ACTIONS.has(next.auto_action_type)) next.instant = false;
      return { ...m, [ru.id]: next };
    });
  }, []);

  const resetDraft = useCallback((ruleId: string) => {
    setRuleDrafts((m) => {
      const { [ruleId]: _omit, ...rest } = m;
      void _omit;
      return rest;
    });
  }, []);

  /** 명시적 「저장」 — 즉시 실행·활성 변경은 L2(사유), 그 외 L1 확인. */
  const saveRule = useCallback(
    async (ru: RuleRow) => {
      if (ruleBusyId) return;
      const base = ruleToDraft(ru);
      const d = ruleDrafts[ru.id];
      if (!d || sameDraft(d, base)) return;

      const intField = (v: string, min: number): number | null => {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n >= min ? n : null;
      };
      const patch: Record<string, unknown> = {};
      const numFields: [keyof RuleDraft, number][] = [
        ["threshold_minutes", 1],
        ["repeat_minutes", 1],
        ["escalate_after_minutes", 1],
        ["max_escalation_level", 1],
      ];
      for (const [k, min] of numFields) {
        if (d[k] === base[k]) continue;
        const n = intField(String(d[k]), min);
        if (n == null) {
          setResult({ ok: false, code: "invalid_rule_number" });
          return;
        }
        patch[k] = n;
      }
      const autoChanged =
        d.auto_action_type !== base.auto_action_type ||
        d.auto_action_delay_minutes !== base.auto_action_delay_minutes ||
        d.auto_action_min_escalation_count !== base.auto_action_min_escalation_count ||
        d.instant !== base.instant;
      if (autoChanged) {
        if (!d.auto_action_type) {
          patch.auto_action_enabled = false;
        } else {
          const delay = d.auto_action_delay_minutes.trim() === "" ? 60 : intField(d.auto_action_delay_minutes, 1);
          const minEsc = intField(d.auto_action_min_escalation_count, 0);
          if (delay == null || minEsc == null) {
            setResult({ ok: false, code: "auto_action_requires_type_and_delay" });
            return;
          }
          patch.auto_action_enabled = true;
          patch.auto_action_type = d.auto_action_type;
          patch.auto_action_delay_minutes = delay;
          patch.auto_action_min_escalation_count = minEsc;
          patch.auto_action_requires_approval = RISKY_AUTO_ACTIONS.has(d.auto_action_type) ? true : !d.instant;
        }
      }
      if (d.is_active !== base.is_active) patch.is_active = d.is_active;
      if (Object.keys(patch).length === 0) {
        resetDraft(ru.id);
        return;
      }

      const sensitive = d.instant !== base.instant || d.is_active !== base.is_active;
      const name = ru.rule_name || (ko ? "이 규칙" : "this rule");
      const notes: string[] = [];
      if (d.instant !== base.instant) {
        notes.push(
          d.instant
            ? ko
              ? "승인 없이 자동 조치가 바로 실행되도록 바뀝니다."
              : "Auto actions will run immediately without approval."
            : ko
              ? "자동 조치가 승인 후 실행되도록 바뀝니다."
              : "Auto actions will wait for approval."
        );
      }
      if (d.is_active !== base.is_active) {
        notes.push(
          d.is_active
            ? ko
              ? "규칙이 활성화되어 경고가 다시 생성됩니다."
              : "The rule will be active and create alerts."
            : ko
              ? "규칙이 비활성화되어 경고가 생성되지 않습니다."
              : "The rule will be inactive and stop creating alerts."
        );
      }
      const c = await confirmAdminAction({
        level: sensitive ? "L2" : "L1",
        ko,
        title: ko ? `규칙 저장: ${name}` : `Save rule: ${name}`,
        description: notes.length ? notes.join("\n") : ko ? "변경한 값을 저장합니다." : "Save your changes.",
        confirmLabel: ko ? "저장" : "Save",
        destructive: sensitive && (d.instant || !d.is_active),
      });
      if (!c.ok) return;
      if (c.reason) patch.reason = c.reason;
      // CAS — 화면이 본 규칙 버전 (다른 관리자 저장 시 409)
      patch.expected_updated_at = ru.updated_at ?? "";

      setRuleBusyId(ru.id);
      setResult(null);
      try {
        const res = await fetch(`/api/admin/delivery-operation-alerts/rules/${encodeURIComponent(ru.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setResult({ ok: false, code: apiErr(res.status, j, "update_failed") });
          return;
        }
        resetDraft(ru.id);
        setResult({ ok: true, message: ko ? `「${name}」 규칙을 저장했습니다.` : `Saved rule "${name}".` });
        load();
      } catch {
        setResult({ ok: false, code: "network_error" });
      } finally {
        setRuleBusyId(null);
      }
    },
    [ruleBusyId, ruleDrafts, ko, load, resetDraft]
  );

  const rowStress = (ev: EventRow) =>
    ev.severity === "critical" || (typeof ev.escalation_count === "number" && ev.escalation_count > 0);

  return (
    <div className="sam-page-stack">
      <AdminPageHeader title={ko ? "배달 경고" : "Delivery alerts"} description={t("admin_del_alert_page_desc")} />

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {loadErr ? (
        loadErr.status === 503 ? (
          <div role="alert" className="rounded-ui-rect border border-sam-warning/20 bg-sam-warning-soft px-4 py-3 text-sam-warning sam-text-body-secondary">
            {t("admin_r4d_alert_not_ready")}
          </div>
        ) : (
          <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={() => load()} />
        )
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
        <h2 className="mb-1 sam-text-body font-medium text-sam-fg">{t("admin_del_alert_section_rules")}</h2>
        <p className="mb-3 sam-text-xxs text-sam-muted">
          {ko
            ? "값을 바꾼 뒤 각 규칙의 「저장」을 눌러야 적용됩니다."
            : "Changes apply only after you press Save on each rule."}
        </p>
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
                <th className="py-2 pr-2 font-medium">{ko ? "저장" : "Save"}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((ru) => {
                const d = draftFor(ru);
                const dirty = !!ruleDrafts[ru.id] && !sameDraft(ruleDrafts[ru.id], ruleToDraft(ru));
                const busy = ruleBusyId === ru.id;
                return (
                <tr key={ru.id} className={`border-b border-sam-border/70 ${dirty ? "bg-sam-warning-soft/20" : ""}`}>
                  <td className="py-2 pr-2 text-sam-fg">
                    <div>{ru.rule_name || (ko ? "이름 없는 규칙" : "Unnamed rule")}</div>
                    <AdminTechDetails ko={ko}>{ru.rule_key}</AdminTechDetails>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      className="sam-input h-8 w-20 text-sm"
                      value={d.threshold_minutes}
                      disabled={busy}
                      onChange={(ev) => editDraft(ru, { threshold_minutes: ev.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      className="sam-input h-8 w-20 text-sm"
                      value={d.repeat_minutes}
                      disabled={busy}
                      onChange={(ev) => editDraft(ru, { repeat_minutes: ev.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      className="sam-input h-8 w-20 text-sm"
                      value={d.escalate_after_minutes}
                      disabled={busy}
                      onChange={(ev) => editDraft(ru, { escalate_after_minutes: ev.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      className="sam-input h-8 w-16 text-sm"
                      value={d.max_escalation_level}
                      disabled={busy}
                      onChange={(ev) => editDraft(ru, { max_escalation_level: ev.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2 tabular-nums">{ru.escalation_level}</td>
                  <td className="py-2 pr-2">
                    <select
                      className="sam-input h-8 max-w-[9.5rem] text-xs"
                      disabled={busy}
                      value={d.auto_action_type}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        editDraft(ru, {
                          auto_action_type: v,
                          auto_action_delay_minutes: v && !d.auto_action_delay_minutes ? "60" : d.auto_action_delay_minutes,
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
                      type="number"
                      className="sam-input h-8 w-16 text-sm"
                      value={d.auto_action_delay_minutes}
                      disabled={busy || !d.auto_action_type}
                      title={t("admin_del_alert_title_auto_delay_from_first")}
                      onChange={(ev) => editDraft(ru, { auto_action_delay_minutes: ev.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      className="sam-input h-8 w-14 text-sm"
                      value={d.auto_action_min_escalation_count}
                      disabled={busy || !d.auto_action_type}
                      title={t("admin_del_alert_title_min_escalation")}
                      onChange={(ev) => editDraft(ru, { auto_action_min_escalation_count: ev.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 sam-text-xxs">
                      <input
                        type="checkbox"
                        checked={d.instant}
                        disabled={busy || !d.auto_action_type || RISKY_AUTO_ACTIONS.has(d.auto_action_type)}
                        title={t("admin_del_alert_title_risk_requires_approval")}
                        onChange={(ev) => editDraft(ru, { instant: ev.target.checked })}
                      />
                    </label>
                  </td>
                  <td className="py-2 pr-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 sam-text-xxs">
                      <input
                        type="checkbox"
                        checked={d.is_active}
                        disabled={busy}
                        onChange={(ev) => editDraft(ru, { is_active: ev.target.checked })}
                      />
                      {t("admin_del_alert_state_on")}
                    </label>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="sam-btn sam-btn--primary sam-btn--sm"
                        disabled={busy || !dirty || (ruleBusyId !== null && ruleBusyId !== ru.id)}
                        onClick={() => void saveRule(ru)}
                      >
                        {busy ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
                      </button>
                      {dirty ? (
                        <button
                          type="button"
                          className="sam-btn sam-btn--outline sam-btn--sm"
                          disabled={busy}
                          onClick={() => resetDraft(ru.id)}
                        >
                          {ko ? "취소" : "Cancel"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
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
                    <span className="font-medium text-sam-fg">{ev.rule?.rule_name || (ev.rule ? (ko ? "이름 없는 규칙" : "Unnamed rule") : dash)}</span>
                  </td>
                  <td className="py-2 pr-2">
                    {ev.order_id ? (
                      <Link
                        href={`/admin/stores/orders/${encodeURIComponent(ev.order_id)}`}
                        className="text-signature underline sam-text-xxs"
                      >
                        {ev.order_no || (ko ? "주문 상세" : "Order detail")}
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
                              void patchEventJson(
                                ev.id,
                                {
                                  action: "assign",
                                  assigned_admin_id: assignPick[ev.id],
                                  assignment_note: assignMemo[ev.id] || undefined,
                                },
                                t("admin_r4d_alert_assign_done")
                              )
                            }
                          >
                            {t("admin_del_alert_btn_assign")}
                          </button>
                          <button
                            type="button"
                            className="sam-btn sam-btn--outline sam-btn--sm"
                            disabled={busyId === ev.id || !ev.assigned_admin_id}
                            onClick={() => void patchEventJson(ev.id, { action: "unassign" }, t("admin_r4d_alert_unassign_done"))}
                          >
                            {t("admin_del_alert_btn_unassign")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">{adminStatusLabel("alert_event", ev.event_status, ko).label}</td>
                  <td className="py-2 pr-2 font-medium">{adminStatusLabel("alert_severity", ev.severity, ko).label}</td>
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
                      // 명시적 저장 — 입력 이탈 시 자동 저장하지 않는다
                      <div className="mb-1 flex gap-1">
                        <input
                          className="sam-input h-8 w-full min-w-[8rem] text-xxs"
                          placeholder={t("admin_del_alert_ph_handling_note")}
                          value={handlingDraft[ev.id] ?? ev.handling_note ?? ""}
                          onChange={(e) => setHandlingDraft((m) => ({ ...m, [ev.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="sam-btn sam-btn--outline sam-btn--sm shrink-0"
                          disabled={
                            busyId === ev.id ||
                            !(handlingDraft[ev.id] ?? "").trim() ||
                            (handlingDraft[ev.id] ?? "").trim() === (ev.handling_note ?? "").trim()
                          }
                          onClick={async () => {
                            const ok = await patchEventJson(
                              ev.id,
                              { action: "handling", handling_note: (handlingDraft[ev.id] ?? "").trim() },
                              t("admin_r4d_handling_saved")
                            );
                            if (ok) setHandlingDraft(({ [ev.id]: _done, ...rest }) => (void _done, rest));
                          }}
                        >
                          {t("admin_r4d_handling_save")}
                        </button>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="sam-btn sam-btn--outline sam-btn--sm"
                        disabled={busyId === ev.id || ev.event_status !== "open"}
                        onClick={() =>
                          void patchEventJson(
                            ev.id,
                            { action: "acknowledge", note: actionNotes[ev.id] || undefined },
                            t("admin_r4d_alert_ack_done")
                          )
                        }
                      >
                        {t("admin_del_alert_btn_acknowledge")}
                      </button>
                      <button
                        type="button"
                        className="sam-btn sam-btn--outline sam-btn--sm"
                        disabled={busyId === ev.id || (ev.event_status !== "open" && ev.event_status !== "acknowledged")}
                        onClick={async () => {
                          const c = await confirmAdminAction({
                            level: "L1",
                            ko,
                            title: t("admin_r4d_alert_mute_title"),
                            description: t("admin_r4d_alert_mute_desc"),
                            confirmLabel: ko ? "알림 끄기" : "Mute alerts",
                          });
                          if (!c.ok) return;
                          void patchEventJson(
                            ev.id,
                            { action: "mute", note: actionNotes[ev.id] || undefined },
                            t("admin_r4d_alert_mute_done")
                          );
                        }}
                      >
                        {ko ? "알림 끄기" : "Mute alerts"}
                      </button>
                      <button
                        type="button"
                        className="sam-btn sam-btn--primary sam-btn--sm"
                        disabled={busyId === ev.id || ev.event_status === "resolved"}
                        onClick={async () => {
                          const c = await confirmAdminAction({
                            level: "L1",
                            ko,
                            title: t("admin_r4d_alert_resolve_title"),
                            description: ev.rule?.rule_name || undefined,
                            confirmLabel: t("admin_del_alert_btn_resolve"),
                          });
                          if (!c.ok) return;
                          void patchEventJson(
                            ev.id,
                            { action: "resolve", note: actionNotes[ev.id] || undefined },
                            t("admin_r4d_alert_resolve_done")
                          );
                        }}
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
