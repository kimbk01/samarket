"use client";

/**
 * System → 데이터 초기화 → 전체 데이터 초기화 (LOCKED by default).
 * Server-enforced flow: 창 요청 → 다른 최고관리자 승인(재인증) → Dry-run → 확인(백업 참조·문구·재인증)
 * → 다른 최고관리자 승인(문구·재인증) → 실행(문구·재인증) → 진행 → 결과 → 자동 재잠금.
 * The UI only displays state and sends requests; every rule is re-checked by the API and Postgres.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Json = Record<string, unknown>;
type TableSummary = {
  class: string;
  total: number;
  delete: number;
  keep: number;
  keptReasons: Record<string, number>;
  skipReason: string | null;
  step: number | null;
};
type State = {
  locked: boolean;
  lockReasons: string[];
  window: {
    id: string | null;
    status: string | null;
    reason: string | null;
    requested_by: string | null;
    requested_at: string | null;
    approved_by: string | null;
    open_until: string | null;
  } | null;
  plan: {
    id: string;
    status: string;
    created_by: string;
    created_at: string;
    manifest_version: string;
    summary: (Json & { tables?: Record<string, TableSummary> }) | null;
    plan_hash: string | null;
    backup_reference: string | null;
    confirmed_by: string | null;
    approved_by: string | null;
    expires_at: string;
  } | null;
  phrases: { confirm: string; approve: string; start: string } | null;
  run: { id: string; plan_id: string; status: string; phase: string; abort_requested: boolean; started_at: string; finished_at: string | null; result: Json | null; started_by: string } | null;
  steps: Array<{ table_name: string; step_order: number; planned: number; deleted: number; skipped: number; status: string }>;
  authProgress: Record<string, number>;
  storageProgress: Record<string, number>;
  history: Array<{ window: Json; plans: Json[]; run: Json | null }>;
  audit: Json[];
  databaseTarget: { target: string; projectRef: string | null; reason: string };
  dbGuard: { present: boolean; allowDestructive: boolean; environmentLabel: string | null };
  manifest: { version: string; tables: number; byClass: Record<string, number> };
};

const API = "/api/admin/system/data-reset/full";
const card = "rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3";
const btn = "rounded border border-sam-border px-3 py-1.5 text-sm disabled:opacity-40";
const dangerBtn = "rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-40";
const input = "mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm";

const LOCK_REASON: Record<string, [string, string]> = {
  window_not_open: ["초기화 창이 열려 있지 않음 (두 명의 최고관리자 필요)", "No open reset window (two Super Admins required)"],
  database_target_production: ["운영(Production) DB — 파괴 실행 영구 차단 (P0)", "Production database — destructive run blocked (P0)"],
  database_target_url_missing: ["DB 대상 확인 불가 — 차단", "Database target unknown — blocked"],
  database_target_unrecognized_host: ["DB 대상 확인 불가 — 차단", "Database target unknown — blocked"],
  qa_allowlist_missing: ["QA 허용 목록(DATA_RESET_QA_SUPABASE_REFS) 없음 — 차단", "QA allowlist (DATA_RESET_QA_SUPABASE_REFS) missing — blocked"],
  database_target_not_in_qa_allowlist: ["연결된 DB가 QA 허용 목록에 없음 — 차단", "Connected database is not on the QA allowlist — blocked"],
  db_guard_locked: ["DB 가드 행 없음/비활성 — 파괴 함수 거부", "DB guard row absent/disabled — destructive functions refuse"],
};

function short(id: string | null | undefined) {
  return id ? id.slice(0, 8) : "-";
}
function fmt(ts: string | null | undefined) {
  return ts ? new Date(ts).toLocaleString() : "-";
}

async function post(body: Json): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as { ok: boolean; data?: unknown; error?: string };
}

/** Password re-auth → single-use token → the guarded action, in one click. */
function ReauthAction(props: {
  ko: boolean;
  label: string;
  intent: { action: string; windowId?: string; planId?: string; planHash?: string };
  disabled?: boolean;
  danger?: boolean;
  onAuthorized: (token: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <label className="block text-xs text-sam-muted">
        {props.ko ? "비밀번호 재입력 (재인증)" : "Re-enter password (re-auth)"}
        <input type="password" autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} disabled={props.disabled || busy} />
      </label>
      <button
        type="button"
        className={props.danger ? dangerBtn : btn}
        disabled={props.disabled || busy || !password}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await post({ action: "reauth", password, intent: props.intent });
          setPassword("");
          if (!r.ok) {
            setErr(r.error ?? "reauth_failed");
            setBusy(false);
            return;
          }
          await props.onAuthorized((r.data as { token: string }).token);
          setBusy(false);
        }}
      >
        {busy ? "…" : props.label}
      </button>
      {err ? <p className="text-xs text-red-700">{err}</p> : null}
    </div>
  );
}

export function AdminFullResetPanel({ ko }: { ko: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [actor, setActor] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(120);
  const [backupRef, setBackupRef] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [showKept, setShowKept] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const autoRef = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" });
    const j = (await res.json().catch(() => null)) as { ok: boolean; state?: State; actorUserId?: string; error?: string } | null;
    if (!j?.ok || !j.state) {
      setError(j?.error ?? `http_${res.status}`);
      return;
    }
    setState(j.state);
    setActor(j.actorUserId ?? "");
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (body: Json) => {
      setBusy(true);
      const r = await post(body);
      if (!r.ok) setError(r.error ?? "failed");
      else setError(null);
      await load();
      setBusy(false);
      return r;
    },
    [load]
  );

  // Progress loop: each advance call runs ≤20 s on the server; resumable at any point.
  useEffect(() => {
    autoRef.current = autoRun;
    if (!autoRun || !state?.run || state.run.status !== "running") return;
    let cancelled = false;
    (async () => {
      while (!cancelled && autoRef.current) {
        const r = await post({ action: "advance_run", runId: state.run!.id });
        await load();
        if (!r.ok) {
          setError(r.error ?? "advance_failed");
          setAutoRun(false);
          break;
        }
        const d = r.data as { finished?: boolean; busy?: boolean };
        if (d.finished) {
          setAutoRun(false);
          break;
        }
        if (d.busy) await new Promise((res) => setTimeout(res, 1500));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, state?.run?.id]);

  if (!state) {
    return <div className={card}>{error ? <p className="text-sm text-red-700">{error}</p> : <p className="text-sm text-sam-muted">…</p>}</div>;
  }

  const w = state.window;
  const p = state.plan;
  const summary = p?.summary ?? null;
  const tables = Object.entries((summary?.tables ?? {}) as Record<string, TableSummary>);
  const deleting = tables.filter(([, t]) => t.delete > 0).sort((a, b) => b[1].delete - a[1].delete);
  const kept = tables.filter(([, t]) => t.keep > 0).sort((a, b) => b[1].keep - a[1].keep);
  const running = state.run?.status === "running";
  const phrase = state.phrases;
  const iRequested = w?.requested_by === actor;
  const iConfirmed = p?.confirmed_by === actor;
  const signatory = p && (p.confirmed_by === actor || p.approved_by === actor);

  return (
    <div className="space-y-3">
      {/* Lock status */}
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${state.locked && !running ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
            {running ? (ko ? "실행 중" : "RUNNING") : state.locked ? "LOCKED" : ko ? "실행 가능 (창 열림)" : "EXECUTABLE (window open)"}
          </span>
          <span className="text-xs text-sam-muted">
            {ko ? "DB 대상" : "DB target"}: {state.databaseTarget.target} {state.databaseTarget.projectRef ?? ""} · {ko ? "가드" : "guard"}:{" "}
            {state.dbGuard.allowDestructive ? state.dbGuard.environmentLabel : ko ? "없음" : "none"} · manifest {state.manifest.version} ({state.manifest.tables})
          </span>
        </div>
        {state.lockReasons.length ? (
          <ul className="list-disc pl-5 text-xs text-sam-fg">
            {state.lockReasons.map((r) => (
              <li key={r}>{(LOCK_REASON[r] ?? [r, r])[ko ? 0 : 1]}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-sam-muted">
          {ko
            ? "평상시 잠김. 미분류·실회원·관리자·시스템·주문/결제/원장·신고/제재 기록은 삭제되지 않으며, TESTER 계정 소유 데이터만 대상입니다. 완료·실패·만료 시 자동으로 다시 잠깁니다."
            : "Locked by default. Unclassified, real-member, admin, system, order/payment/ledger and report/sanction data are never deleted; only TESTER-owned data is targeted. Re-locks automatically on completion, failure or expiry."}
        </p>
        {error ? <p className="text-sm text-red-700">{ko ? "거부/오류" : "Refused/error"}: {error}</p> : null}
      </div>

      {/* 1. Window */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-sam-fg">1. {ko ? "초기화 창 (두 명의 최고관리자)" : "Reset window (two Super Admins)"}</h3>
        {!w || !w.id ? (
          <>
            <label className="block text-sm text-sam-fg">
              {ko ? "사유" : "Reason"}
              <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <button type="button" className={btn} disabled={busy || reason.trim().length < 5} onClick={() => void act({ action: "request_window", reason })}>
              {ko ? "초기화 창 요청" : "Request window"}
            </button>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {ko ? "상태" : "Status"}: <b>{w.status}</b> · {ko ? "요청" : "requested by"} {short(w.requested_by)} ({fmt(w.requested_at)})
              {w.approved_by ? ` · ${ko ? "승인" : "approved by"} ${short(w.approved_by)}` : ""}
              {w.open_until ? ` · ${ko ? "만료" : "until"} ${fmt(w.open_until)}` : ""}
            </p>
            <p className="text-xs text-sam-muted">{w.reason}</p>
            {w.status === "requested" && !iRequested ? (
              <div className="space-y-2">
                <label className="block text-xs text-sam-muted">
                  {ko ? "열림 시간(분, 15–240)" : "Open minutes (15–240)"}
                  <input type="number" min={15} max={240} className={input} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
                </label>
                <ReauthAction
                  ko={ko}
                  label={ko ? "승인하고 창 열기" : "Approve & open window"}
                  intent={{ action: "decide_window", windowId: w.id }}
                  disabled={busy}
                  onAuthorized={async (token) => void (await act({ action: "decide_window", windowId: w.id, approve: true, minutes, token }))}
                />
                <button type="button" className={btn} disabled={busy} onClick={() => void act({ action: "decide_window", windowId: w.id, approve: false })}>
                  {ko ? "거절" : "Reject"}
                </button>
              </div>
            ) : null}
            {w.status === "requested" && iRequested ? (
              <p className="text-xs text-amber-800">{ko ? "다른 최고관리자의 승인이 필요합니다." : "Another Super Admin must approve."}</p>
            ) : null}
            {!running ? (
              <button type="button" className={btn} disabled={busy} onClick={() => void act({ action: "close_window", windowId: w.id, reason: "closed_by_admin" })}>
                {ko ? "창 닫기 (재잠금)" : "Close window (re-lock)"}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* 2. Dry-run */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-sam-fg">2. {ko ? "Dry-run · 범위 · 보존 데이터" : "Dry-run · scope · kept data"}</h3>
        <button type="button" className={btn} disabled={busy || w?.status !== "open" || running} onClick={() => void act({ action: "build_plan", windowId: w?.id })}>
          {p ? (ko ? "Dry-run 다시 계산" : "Recompute dry-run") : ko ? "Dry-run 계산" : "Run dry-run"}
        </button>
        {p && summary ? (
          <div className="space-y-2 text-sm">
            <p>
              {ko ? "계획" : "Plan"} {short(p.id)} · <b>{p.status}</b> · hash <code>{p.plan_hash?.slice(0, 16)}</code> · {ko ? "만료" : "expires"} {fmt(p.expires_at)}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>{ko ? "삭제 예정 행" : "Rows to delete"}: <b>{String(summary.deleteRows ?? 0)}</b></div>
              <div>{ko ? "보존 행" : "Rows kept"}: <b>{Number(summary.totalRows ?? 0) - Number(summary.deleteRows ?? 0)}</b></div>
              <div>{ko ? "Auth 계정 대상" : "Auth targets"}: <b>{String(summary.authTargets ?? 0)}</b></div>
              <div>{ko ? "Storage 객체 대상" : "Storage targets"}: <b>{String(summary.storageTargets ?? 0)}</b></div>
            </div>
            <p className="text-xs text-sam-muted">
              {ko ? "계정 분류" : "Accounts"}: {Object.entries((summary.accounts ?? {}) as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(" · ")}
            </p>
            <div className="max-h-64 overflow-auto rounded border border-sam-border">
              <table className="w-full text-xs">
                <thead className="bg-sam-app text-sam-muted">
                  <tr><th className="px-2 py-1 text-left">{ko ? "테이블" : "Table"}</th><th className="px-2 py-1">{ko ? "분류" : "Class"}</th><th className="px-2 py-1 text-right">{ko ? "삭제" : "Delete"}</th><th className="px-2 py-1 text-right">{ko ? "보존" : "Keep"}</th><th className="px-2 py-1">{ko ? "순서" : "Step"}</th></tr>
                </thead>
                <tbody>
                  {deleting.map(([name, t]) => (
                    <tr key={name} className="border-t border-sam-border">
                      <td className="px-2 py-1 font-mono">{name}</td><td className="px-2 py-1 text-center">{t.class}</td>
                      <td className="px-2 py-1 text-right">{t.delete}</td><td className="px-2 py-1 text-right">{t.keep}</td><td className="px-2 py-1 text-center">{t.step ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="text-xs underline text-sam-muted" onClick={() => setShowKept((v) => !v)}>
              {showKept ? (ko ? "보존 데이터 숨기기" : "Hide kept data") : ko ? `보존 데이터 보기 (${kept.length}개 테이블)` : `Show kept data (${kept.length} tables)`}
            </button>
            {showKept ? (
              <div className="max-h-64 overflow-auto rounded border border-sam-border">
                <table className="w-full text-xs">
                  <tbody>
                    {kept.map(([name, t]) => (
                      <tr key={name} className="border-t border-sam-border">
                        <td className="px-2 py-1 font-mono">{name}</td><td className="px-2 py-1">{t.class}</td><td className="px-2 py-1 text-right">{t.keep}</td>
                        <td className="px-2 py-1 text-sam-muted">{Object.entries(t.keptReasons ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 3–4. Confirm + approve */}
      {p && phrase && p.plan_hash ? (
        <div className={card}>
          <h3 className="text-sm font-semibold text-sam-fg">3. {ko ? "확인 · 승인 (서로 다른 최고관리자)" : "Confirm · approve (different Super Admins)"}</h3>
          {p.status === "ready" ? (
            <div className="space-y-2">
              <label className="block text-sm">
                {ko ? "백업 참조 (복구 지점 ID/시각)" : "Backup reference (restore point id/time)"}
                <input className={input} value={backupRef} onChange={(e) => setBackupRef(e.target.value)} />
              </label>
              <label className="block text-sm">
                {ko ? "확인 문구" : "Phrase"} <code>{phrase.confirm}</code>
                <input className={input} value={typed.confirm ?? ""} onChange={(e) => setTyped({ ...typed, confirm: e.target.value })} />
              </label>
              <ReauthAction
                ko={ko}
                label={ko ? "계획 확인" : "Confirm plan"}
                intent={{ action: "confirm_plan", planId: p.id, planHash: p.plan_hash }}
                disabled={busy || backupRef.trim().length < 3 || typed.confirm !== phrase.confirm}
                onAuthorized={async (token) =>
                  void (await act({ action: "confirm_plan", planId: p.id, planHash: p.plan_hash, backupReference: backupRef, typedPhrase: typed.confirm, token }))
                }
              />
            </div>
          ) : null}
          {p.status === "confirmed" ? (
            iConfirmed ? (
              <p className="text-xs text-amber-800">{ko ? `확인됨 (${short(p.confirmed_by)}). 다른 최고관리자의 승인이 필요합니다.` : "Confirmed. Another Super Admin must approve."}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs">{ko ? "백업 참조" : "Backup"}: {p.backup_reference} · {ko ? "확인자" : "confirmed by"} {short(p.confirmed_by)}</p>
                <label className="block text-sm">
                  {ko ? "승인 문구" : "Phrase"} <code>{phrase.approve}</code>
                  <input className={input} value={typed.approve ?? ""} onChange={(e) => setTyped({ ...typed, approve: e.target.value })} />
                </label>
                <ReauthAction
                  ko={ko}
                  label={ko ? "계획 승인" : "Approve plan"}
                  intent={{ action: "approve_plan", planId: p.id, planHash: p.plan_hash }}
                  disabled={busy || typed.approve !== phrase.approve}
                  onAuthorized={async (token) => void (await act({ action: "approve_plan", planId: p.id, planHash: p.plan_hash, typedPhrase: typed.approve, token }))}
                />
              </div>
            )
          ) : null}
          {p.status === "approved" ? (
            <div className="space-y-2">
              <p className="text-xs">
                {ko ? "확인" : "Confirmed"} {short(p.confirmed_by)} · {ko ? "승인" : "approved"} {short(p.approved_by)} · {ko ? "백업" : "backup"} {p.backup_reference}
              </p>
              {signatory ? (
                <>
                  <label className="block text-sm text-red-900">
                    {ko ? "실행 문구" : "Run phrase"} <code>{phrase.start}</code>
                    <input className={input} value={typed.start ?? ""} onChange={(e) => setTyped({ ...typed, start: e.target.value })} />
                  </label>
                  <ReauthAction
                    ko={ko}
                    danger
                    label={ko ? "전체 데이터 초기화 실행" : "Run full data reset"}
                    intent={{ action: "start_run", planId: p.id, planHash: p.plan_hash }}
                    disabled={busy || typed.start !== phrase.start || state.lockReasons.length > 0}
                    onAuthorized={async (token) => {
                      const r = await act({ action: "start_run", planId: p.id, planHash: p.plan_hash, typedPhrase: typed.start, token });
                      if (r.ok) setAutoRun(true);
                    }}
                  />
                </>
              ) : (
                <p className="text-xs text-sam-muted">{ko ? "확인자 또는 승인자만 실행할 수 있습니다." : "Only the confirmer or approver can start."}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 5. Progress / results */}
      {state.run ? (
        <div className={card}>
          <h3 className="text-sm font-semibold text-sam-fg">4. {ko ? "진행 · 결과" : "Progress · result"}</h3>
          <p className="text-sm">
            {ko ? "실행" : "Run"} {short(state.run.id)} · <b>{state.run.status}</b> · {ko ? "단계" : "phase"} {state.run.phase}
            {state.run.abort_requested ? ` · ${ko ? "중단 요청됨" : "abort requested"}` : ""} · {fmt(state.run.started_at)} → {fmt(state.run.finished_at)}
          </p>
          {running ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={autoRun} onClick={() => setAutoRun(true)}>
                {autoRun ? (ko ? "진행 중…" : "Running…") : ko ? "계속 진행" : "Continue"}
              </button>
              <button type="button" className={dangerBtn} disabled={busy} onClick={() => { setAutoRun(false); void act({ action: "abort_run", runId: state.run!.id }); }}>
                {ko ? "중단" : "Abort"}
              </button>
            </div>
          ) : null}
          <p className="text-xs text-sam-muted">
            DB {state.steps.filter((s) => s.status === "done" || s.status === "partial").length}/{state.steps.length} {ko ? "테이블" : "tables"} ·{" "}
            {ko ? "삭제" : "deleted"} {state.steps.reduce((a, s) => a + Number(s.deleted), 0)}/{state.steps.reduce((a, s) => a + Number(s.planned), 0)} ·{" "}
            {ko ? "보호(건너뜀)" : "protected"} {state.steps.reduce((a, s) => a + Number(s.skipped), 0)} · Storage {JSON.stringify(state.storageProgress)} · Auth {JSON.stringify(state.authProgress)}
          </p>
          {state.run.result ? (
            <pre className="max-h-64 overflow-auto rounded bg-sam-app p-2 text-[11px]">{JSON.stringify(state.run.result, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}

      {/* History + audit */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-sam-fg">{ko ? "이력 · 감사 로그" : "History · audit log"}</h3>
        <div className="max-h-48 overflow-auto text-xs">
          {state.history.map((h) => (
            <div key={String(h.window.id)} className="border-t border-sam-border py-1">
              {fmt(String(h.window.requested_at))} · {String(h.window.status)} {h.window.close_reason ? `(${String(h.window.close_reason)})` : ""} · {ko ? "계획" : "plans"} {h.plans.length}
              {h.run ? ` · ${ko ? "실행" : "run"} ${String(h.run.status)}` : ""}
            </div>
          ))}
        </div>
        <div className="max-h-64 overflow-auto text-xs">
          {state.audit.map((a) => (
            <div key={String(a.id)} className={`border-t border-sam-border py-1 ${a.outcome === "blocked" ? "text-red-800" : a.outcome === "error" ? "text-amber-800" : ""}`}>
              {fmt(String(a.at))} · {short(String(a.actor_user_id ?? ""))} · <b>{String(a.action)}</b> · {String(a.outcome)}{" "}
              <span className="text-sam-muted">{JSON.stringify(a.detail ?? {}).slice(0, 160)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
