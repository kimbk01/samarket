"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

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

function bannerLabel(code: string): string {
  switch (code) {
    case "kill_switch_off":
      return "전역 자동 실행이 OFF입니다. 크론·RPC는 즉시 반환되며 승인 파이프라인도 대부분 멈춥니다.";
    case "dangerous_instant_execution_risk":
      return "위험 액션 룰에서 즉시 실행(무승인) 설정이 남아 있습니다. API·정책과 불일치할 수 있으니 룰을 점검하세요.";
    case "stale_pending_approval":
      return "30분 이상 승인 대기 건이 있습니다. 운영자 확인이 필요합니다.";
    case "failed_actions_need_attention":
      return "재시도 가능한 실패 액션이 있습니다.";
    case "today_failed_present":
      return "오늘 실패한 자동 액션이 있습니다.";
    case "possible_operator_backlog":
      return "자동 실행은 ON인데 승인 대기가 오래된 비율이 높습니다. 운영 백로그 또는 처리 지연을 의심해 보세요.";
    default:
      return code;
  }
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
          setError(r.status === 503 ? "스키마 미적용(마이그레이션)" : `목록 실패 (${r.status})`);
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
        setError("목록 실패");
        setLoading(false);
      });
  }, [buildQuery]);

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
          setError(`설정 저장 실패 (${r.status})`);
          return;
        }
        setKillOn(next);
        setError(null);
        loadData();
      });
    },
    [loadData]
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
            setError(err || `처리 실패 (${r.status})`);
            return;
          }
          setMemo((m) => ({ ...m, [actionId]: "" }));
          loadData();
        })
        .finally(() => setBusyId(null));
    },
    [memo, loadData]
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
        title="배달 자동 액션"
        description="실행 이력 · 승인 대기 · 실패 재시도 · 전역 실행 스위치(기본 OFF)"
      />

      {!dashboard ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          운영 리포트 RPC 미적용 시 KPI는 비어 있습니다. 마이그레이션{" "}
          <span className="font-mono text-[10px]">20260515120000_delivery_auto_actions_report_rpc</span> 적용 후 새로고침하세요.
        </div>
      ) : null}

      {dashboard && !dashboard.dangerous_instant_misconfigured ? (
        <div className="rounded-ui-rect border border-sam-border/70 bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
          위험 액션(<span className="font-mono">auto_hold_settlement</span>,{" "}
          <span className="font-mono">auto_reassign_rider</span>, <span className="font-mono">auto_mute</span>)은 제품 정책상
          무승인 즉시 실행이 차단됩니다.
        </div>
      ) : null}

      {banners.length ? (
        <div className="space-y-2">
          {banners.map((code) => (
            <div
              key={code}
              className="rounded-ui-rect border border-sam-warning/25 bg-sam-warning-soft px-3 py-2 sam-text-xxs text-sam-warning"
            >
              {bannerLabel(code)}
            </div>
          ))}
        </div>
      ) : null}

      {kpi ? (
        <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-xxs">
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            자동 실행:{" "}
            <strong className="text-sam-fg">{dashboard?.kill_switch_on ? "ON" : "OFF"}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            승인 대기 <strong className="text-sam-fg">{num(kpi.pending_total)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            오래된 대기(≥30m) <strong className="text-sam-fg">{num(kpi.pending_stale_30m)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            오늘 success <strong className="text-sam-fg">{num(kpi.today_success)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            오늘 failed <strong className="text-sam-fg">{num(kpi.today_failed)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            오늘 rejected <strong className="text-sam-fg">{num(kpi.today_rejected)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            재시도 필요 <strong className="text-sam-fg">{num(kpi.retry_needed)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            위험 승인 대기 <strong className="text-sam-fg">{num(kpi.dangerous_pending)}</strong>
          </span>
          <span className="rounded-full border border-sam-border px-2 py-0.5 tabular-nums">
            평균 승인 대기(오늘·분){" "}
            <strong className="text-sam-fg">
              {kpi.avg_approval_wait_minutes_today == null ? "—" : String(kpi.avg_approval_wait_minutes_today)}
            </strong>
          </span>
        </div>
      ) : null}

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <summary className="cursor-pointer px-3 py-2 sam-text-xxs font-medium text-sam-fg">
          룰별 통계 (UTC 오늘 기준·펼치기)
        </summary>
        <div className="overflow-x-auto border-t border-sam-border">
          <table className="min-w-[960px] w-full border-collapse sam-text-xxs text-sam-muted">
            <thead>
              <tr className="border-b border-sam-border text-left">
                <th className="py-2 px-2 font-medium">룰</th>
                <th className="py-2 px-2 font-medium">위험</th>
                <th className="py-2 px-2 font-medium">오늘 생성</th>
                <th className="py-2 px-2 font-medium">성공</th>
                <th className="py-2 px-2 font-medium">실패</th>
                <th className="py-2 px-2 font-medium">거절</th>
                <th className="py-2 px-2 font-medium">대기(전체)</th>
                <th className="py-2 px-2 font-medium">평균 승인(분)</th>
                <th className="py-2 px-2 font-medium">평균 retry</th>
              </tr>
            </thead>
            <tbody>
              {ruleStats.map((r) => (
                <tr key={r.rule_id} className="border-b border-sam-border/60">
                  <td className="py-2 px-2 text-sam-fg">
                    <div className="font-medium">{r.rule_name}</div>
                    <div className="font-mono text-[10px]">{r.rule_key}</div>
                  </td>
                  <td className="py-2 px-2">{r.dangerous ? "예" : "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.actions_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.success_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.failed_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.rejected_today)}</td>
                  <td className="py-2 px-2 tabular-nums">{num(r.pending_open)}</td>
                  <td className="py-2 px-2 tabular-nums">
                    {r.avg_approval_wait_minutes_today == null ? "—" : String(r.avg_approval_wait_minutes_today)}
                  </td>
                  <td className="py-2 px-2 tabular-nums">
                    {r.avg_retry_today == null ? "—" : String(r.avg_retry_today)}
                  </td>
                </tr>
              ))}
              {!loading && ruleStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sam-muted">
                    자동 액션이 켜진 룰이 없거나 집계 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/delivery-alerts" className="sam-btn sam-btn--outline sam-btn--sm">
          ← 운영 알림
        </Link>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs">
          <input
            type="checkbox"
            checked={killOn}
            disabled={!settingsLoaded}
            onChange={(e) => toggleKill(e.target.checked)}
          />
          <span className="text-sam-fg">자동 실행 허용 (kill switch ON)</span>
        </label>
        <span className="text-sam-muted sam-text-xxs">
          OFF면 크론·동기화 후 RPC가 즉시 반환됩니다. 승인·직접 재시도(무승인 룰)도 대부분 차단됩니다.
        </span>
      </div>

      {error ? (
        <div className="rounded-ui-rect border border-sam-warning/20 bg-sam-warning-soft px-4 py-3 text-sam-warning sam-text-body-secondary">
          {error}
          <button type="button" className="sam-btn sam-btn--outline sam-btn--sm ml-2" onClick={() => setError(null)}>
            닫기
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
            {f === "all" ? "전체" : f === "pending_approval" ? "승인 대기" : f}
          </button>
        ))}
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${dangerousOnly ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setDangerousOnly((v) => !v)}
        >
          위험 액션만
        </button>
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${retryOnly ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setRetryOnly((v) => !v)}
        >
          재시도 가능만
        </button>
        <button
          type="button"
          className={`sam-btn sam-btn--sm ${todayOnly ? "sam-btn--primary" : "sam-btn--outline"}`}
          onClick={() => setTodayOnly((v) => !v)}
        >
          오늘만(UTC)
        </button>
        <select
          className="sam-input h-8 min-w-[160px] sam-text-xxs"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
        >
          <option value="">룰: 전체</option>
          {rulePicklist.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rule_key} · {r.rule_name}
            </option>
          ))}
        </select>
        <button type="button" className="sam-btn sam-btn--outline sam-btn--sm" onClick={() => loadData()} disabled={loading}>
          새로고침
        </button>
      </div>

      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="min-w-[1100px] w-full border-collapse sam-text-xxs text-sam-muted">
          <thead>
            <tr className="border-b border-sam-border text-left">
              <th className="py-2 px-2 font-medium">시각</th>
              <th className="py-2 px-2 font-medium">룰</th>
              <th className="py-2 px-2 font-medium">액션</th>
              <th className="py-2 px-2 font-medium">상태</th>
              <th className="py-2 px-2 font-medium">메시지</th>
              <th className="py-2 px-2 font-medium">재시도</th>
              <th className="py-2 px-2 font-medium">주문</th>
              <th className="py-2 px-2 font-medium">처리</th>
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
                  {a.executed_at?.slice(0, 19)?.replace("T", " ") ?? "—"}
                  {a.stale_pending ? (
                    <div className="text-[10px] text-sam-warning">승인 대기 ≥30m</div>
                  ) : null}
                  {a.dangerous_action ? (
                    <div className="text-[10px] text-sam-muted">위험 액션</div>
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
                    "—"
                  )}
                </td>
                <td className="py-2 px-2">
                  {a.action_status === "pending_approval" ? (
                    <div className="flex flex-col gap-1">
                      <input
                        className="sam-input h-7 text-[11px]"
                        placeholder="메모"
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
                          승인
                        </button>
                        <button
                          type="button"
                          className="sam-btn sam-btn--outline sam-btn--sm px-2 py-1 text-[11px]"
                          disabled={busyId === a.id}
                          onClick={() => postAction(a.id, "reject")}
                        >
                          거절
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
                      재시도
                    </button>
                  ) : (
                    <span className="text-sam-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && actions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sam-muted">
                  표시할 자동 액션 이력이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-xxs text-sam-muted">
        <summary className="cursor-pointer text-sam-fg">metadata 원본 (맨 위 5건)</summary>
        <ul className="mt-2 space-y-2 font-mono text-[10px]">
          {actions.slice(0, 5).map((a) => (
            <li key={`meta-${a.id}`}>
              <span className="text-sam-fg">{a.id.slice(0, 8)}</span> {JSON.stringify(a.metadata ?? {})}
            </li>
          ))}
        </ul>
      </details>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-xxs text-sam-muted">
        운영 안정성 점수(휴리스틱): <strong className="text-sam-fg">{stab}%</strong>
        {dashboard?.generated_at ? (
          <span className="ml-2 font-mono text-[10px]">
            생성 시각 {String(dashboard.generated_at).slice(0, 19).replace("T", " ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
