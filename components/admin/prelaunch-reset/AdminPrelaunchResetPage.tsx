"use client";

/**
 * CUT H — Pre-launch Reset Admin UI.
 * Destructive flow: analyze → protect/block → typed confirm → execute (non-prod only).
 */

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import type { PrelaunchResetPlan, PrelaunchResetPreset } from "@/lib/admin/prelaunch-reset/types";

const PRESET_IDS = Object.keys(PRELAUNCH_RESET_PRESETS) as PrelaunchResetPreset[];

function parseIds(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
}

export function AdminPrelaunchResetPage() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const [preset, setPreset] = useState<PrelaunchResetPreset>("TEST_CONTENT_ONLY");
  const [memberIdsRaw, setMemberIdsRaw] = useState("");
  const [storeIdsRaw, setStoreIdsRaw] = useState("");
  const [contentIdsRaw, setContentIdsRaw] = useState("");
  const [campaignIdsRaw, setCampaignIdsRaw] = useState("");
  const [plan, setPlan] = useState<PrelaunchResetPlan | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<{
    overall: string;
    phases: unknown;
    note?: string;
  } | null>(null);

  const spec = PRELAUNCH_RESET_PRESETS[preset];
  const selector = useMemo(
    () => ({
      memberIds: parseIds(memberIdsRaw),
      storeIds: parseIds(storeIdsRaw),
      contentIds: parseIds(contentIdsRaw),
      deliveryAdCampaignIds: parseIds(campaignIdsRaw),
    }),
    [memberIdsRaw, storeIdsRaw, contentIdsRaw, campaignIdsRaw]
  );

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setExecResult(null);
    setPlan(null);
    setTyped("");
    try {
      const res = await fetch("/api/admin/prelaunch-reset/dry-run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset, ...selector }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        plan?: PrelaunchResetPlan;
      };
      if (!res.ok || !json.ok || !json.plan) {
        setError(json.error ?? "dry_run_failed");
        return;
      }
      setPlan(json.plan);
    } catch {
      setError("dry_run_failed");
    } finally {
      setBusy(false);
    }
  }

  async function runExecute() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    setExecResult(null);
    try {
      const res = await fetch("/api/admin/prelaunch-reset/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset,
          planId: plan.planId,
          expectedHash: plan.planHash,
          typedConfirmation: typed,
          ...selector,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        overall?: string;
        phases?: unknown;
        note?: string;
        reasons?: string[];
      };
      if (!res.ok) {
        setError(
          json.error ??
            (Array.isArray(json.reasons) ? json.reasons.join(",") : "execute_failed")
        );
        if (json.overall) {
          setExecResult({ overall: json.overall, phases: json.phases, note: json.note });
        }
        return;
      }
      setExecResult({
        overall: json.overall ?? "UNKNOWN",
        phases: json.phases,
        note: json.note,
      });
    } catch {
      setError("execute_failed");
    } finally {
      setBusy(false);
    }
  }

  const executeDisabled =
    busy ||
    !plan ||
    plan.blockers.length > 0 ||
    !plan.executeAllowed ||
    typed.trim() !== plan.typedConfirmationPhrase;

  return (
    <div className="space-y-4 pb-10" data-admin-prelaunch-reset="1">
      <AdminPageHeader
        title={safeT("admin_page_prelaunch_reset", {
          fallbackKo: "운영 시작 전 테스트 데이터 정리",
          fallbackEn: "Pre-launch test data cleanup",
        })}
      />

      <div
        className="rounded-ui-rect border border-red-400 bg-red-50 px-4 py-3 text-[13px] text-red-950"
        role="alert"
        data-admin-prelaunch-reset-danger="1"
      >
        <p className="font-bold">
          {safeT("admin_prelaunch_reset_danger_title", {
            fallbackKo: "위험 · 복구 불가할 수 있음",
            fallbackEn: "Danger · may be irreversible",
          })}
        </p>
        <p className="mt-1">
          {safeT("admin_prelaunch_reset_danger_body", {
            fallbackKo:
              "Production 실행은 차단됩니다. Undo 없음. TRUNCATE/전체 wipe/auth 전체 삭제는 지원하지 않습니다. 명시 ID만 선택하세요.",
            fallbackEn:
              "Production execute is blocked. No Undo. No TRUNCATE/full wipe/auth mass delete. Explicit IDs only.",
          })}
        </p>
        <p className="mt-2 font-semibold">
          {safeT("admin_prelaunch_reset_scope_limit", {
            fallbackKo:
              "현재 실행 가능 범위: 명시 ID 기반 테스트 콘텐츠·광고(draft/ended 등)만. 회원/매장 완전 삭제·Auth·Storage cleanup은 미구현(FORBIDDEN/NOT_IMPLEMENTED).",
            fallbackEn:
              "Executable scope now: explicit-ID test content/ads only. Full member/store wipe, Auth, and Storage cleanup are NOT implemented.",
          })}
        </p>
      </div>

      <AdminCard
        title={safeT("admin_prelaunch_reset_step1", {
          fallbackKo: "1. 범위(Preset) 선택",
          fallbackEn: "1. Choose preset",
        })}
      >
        <div className="flex flex-wrap gap-2">
          {PRESET_IDS.map((id) => {
            const p = PRELAUNCH_RESET_PRESETS[id];
            const on = preset === id;
            return (
              <button
                key={id}
                type="button"
                className={`rounded-ui-rect border px-3 py-2 text-left text-[12px] font-semibold ${
                  on
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-sam-border bg-sam-app text-sam-fg"
                }`}
                onClick={() => {
                  setPreset(id);
                  setPlan(null);
                  setExecResult(null);
                }}
              >
                {ko ? p.titleKo : p.titleEn}
              </button>
            );
          })}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-sam-muted">
          {spec.excludesByDefault.map((x) => (
            <li key={x}>
              {safeT("admin_prelaunch_reset_exclude", {
                fallbackKo: `기본 제외: ${x}`,
                fallbackEn: `Excluded by default: ${x}`,
              })}
            </li>
          ))}
        </ul>
      </AdminCard>

      <AdminCard
        title={safeT("admin_prelaunch_reset_step2", {
          fallbackKo: "2. 명시적 대상 ID",
          fallbackEn: "2. Explicit target IDs",
        })}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-[12px]">
            Member IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={memberIdsRaw}
              onChange={(e) => setMemberIdsRaw(e.target.value)}
              placeholder="uuid…"
            />
          </label>
          <label className="block text-[12px]">
            Store IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={storeIdsRaw}
              onChange={(e) => setStoreIdsRaw(e.target.value)}
              placeholder="uuid…"
            />
          </label>
          <label className="block text-[12px]">
            Content IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={contentIdsRaw}
              onChange={(e) => setContentIdsRaw(e.target.value)}
            />
          </label>
          <label className="block text-[12px]">
            Delivery Ad Campaign IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={campaignIdsRaw}
              onChange={(e) => setCampaignIdsRaw(e.target.value)}
            />
          </label>
        </div>
      </AdminCard>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-semibold"
          onClick={() => void runDryRun()}
          data-admin-prelaunch-reset-dry-run="1"
        >
          {safeT("admin_prelaunch_reset_analyze", {
            fallbackKo: "3. 영향 분석 (Dry-run)",
            fallbackEn: "3. Impact analysis (Dry-run)",
          })}
        </button>
      </div>

      {error ? (
        <p className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-900">
          {error}
        </p>
      ) : null}

      {plan ? (
        <AdminCard
          title={safeT("admin_prelaunch_reset_step4", {
            fallbackKo: "4. 보호 / 차단 / 카운트",
            fallbackEn: "4. Protect / block / counts",
          })}
        >
          <div className="grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4" data-admin-prelaunch-reset-counts="1">
            {Object.entries(plan.counts).map(([k, v]) => (
              <div key={k} className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <p className="text-sam-muted">{k}</p>
                <p className="text-[16px] font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] text-sam-muted">
            plan={plan.planId} hash={plan.planHash} env={plan.environment}
          </p>
          {plan.blockers.length ? (
            <ul className="mt-2 list-disc pl-5 text-[12px] font-semibold text-red-800">
              {plan.blockers.map((b) => (
                <li key={b}>BLOCK: {b}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] font-semibold text-emerald-800">No blockers</p>
          )}
          {plan.warnings.length ? (
            <ul className="mt-2 list-disc pl-5 text-[12px] text-amber-900">
              {plan.warnings.map((w) => (
                <li key={w}>WARN: {w}</li>
              ))}
            </ul>
          ) : null}
        </AdminCard>
      ) : null}

      {plan ? (
        <AdminCard
          title={safeT("admin_prelaunch_reset_step5", {
            fallbackKo: "5. Typed confirmation",
            fallbackEn: "5. Typed confirmation",
          })}
        >
          <p className="text-[12px] text-sam-muted">
            {safeT("admin_prelaunch_reset_type_exact", {
              fallbackKo: "아래 문구를 정확히 입력하세요 (플랜 카운트·해시 결합).",
              fallbackEn: "Type the exact phrase (bound to plan counts + hash).",
            })}
          </p>
          <p className="mt-2 rounded-ui-rect bg-sam-app px-3 py-2 font-mono text-[12px] font-bold">
            {plan.typedConfirmationPhrase}
          </p>
          <input
            className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono text-[13px]"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-admin-prelaunch-reset-confirm-input="1"
          />
          <button
            type="button"
            disabled={executeDisabled}
            className="mt-3 rounded-ui-rect bg-red-700 px-4 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void runExecute()}
            data-admin-prelaunch-reset-execute="1"
          >
            {safeT("admin_prelaunch_reset_execute", {
              fallbackKo: "6. 실행 (되돌리기 없음)",
              fallbackEn: "6. Execute (no undo)",
            })}
          </button>
        </AdminCard>
      ) : null}

      {execResult ? (
        <AdminCard
          title={safeT("admin_prelaunch_reset_result", {
            fallbackKo: "결과",
            fallbackEn: "Result",
          })}
        >
          <p className="text-[14px] font-bold" data-admin-prelaunch-reset-overall={execResult.overall}>
            overall: {execResult.overall}
          </p>
          {execResult.note ? <p className="mt-1 text-[12px] text-sam-muted">{execResult.note}</p> : null}
          <pre className="mt-2 overflow-auto rounded-ui-rect bg-sam-app p-3 text-[11px]">
            {JSON.stringify(execResult.phases, null, 2)}
          </pre>
        </AdminCard>
      ) : null}
    </div>
  );
}
