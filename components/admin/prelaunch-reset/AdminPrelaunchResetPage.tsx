"use client";

/**
 * CUT H + ARO-RST-001 — Pre-launch Reset Admin UI.
 * Preset + explicit IDs + selective type checkboxes (multi / select-all).
 * Destructive flow: analyze → protect/block → typed confirm → execute (non-prod only).
 */

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import {
  PRELAUNCH_RESET_SELECTIVE_MATRIX,
  selectAllEligibleScopes,
  type PrelaunchResetSelectiveScope,
} from "@/lib/admin/prelaunch-reset/selective-scopes";
import type { PrelaunchResetPlan, PrelaunchResetPreset } from "@/lib/admin/prelaunch-reset/types";

const PRESET_IDS = Object.keys(PRELAUNCH_RESET_PRESETS) as PrelaunchResetPreset[];

const GROUP_ORDER = [
  "members_stores",
  "content",
  "commerce",
  "ads",
  "other",
  "derived",
] as const;

const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], { ko: string; en: string }> = {
  members_stores: { ko: "회원 / 업체", en: "Members / Stores" },
  content: { ko: "콘텐츠", en: "Content" },
  commerce: { ko: "거래 / 주문", en: "Commerce / Orders" },
  ads: { ko: "광고", en: "Ads" },
  other: { ko: "기타", en: "Other" },
  derived: { ko: "Storage / Auth", en: "Storage / Auth" },
};

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

function supportBadge(
  support: string,
  ko: boolean
): { text: string; className: string } {
  switch (support) {
    case "SUPPORTED":
      return {
        text: ko ? "삭제 가능" : "Deletable",
        className: "border-emerald-600 text-emerald-800 bg-emerald-50",
      };
    case "PARTIAL":
      return {
        text: ko ? "부분 지원" : "Partial",
        className: "border-amber-600 text-amber-900 bg-amber-50",
      };
    case "BLOCKED":
      return {
        text: ko ? "차단" : "Blocked",
        className: "border-red-600 text-red-900 bg-red-50",
      };
    default:
      return {
        text: ko ? "미지원" : "Unsupported",
        className: "border-sam-border text-sam-muted bg-sam-app",
      };
  }
}

export function AdminPrelaunchResetPage() {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const [preset, setPreset] = useState<PrelaunchResetPreset>("TEST_CONTENT_ONLY");
  const [selectedScopes, setSelectedScopes] = useState<PrelaunchResetSelectiveScope[]>(() =>
    selectAllEligibleScopes().filter((k) =>
      ["trade_content", "community_posts", "storage"].includes(k)
    )
  );
  const [memberIdsRaw, setMemberIdsRaw] = useState("");
  const [storeIdsRaw, setStoreIdsRaw] = useState("");
  const [contentIdsRaw, setContentIdsRaw] = useState("");
  const [campaignIdsRaw, setCampaignIdsRaw] = useState("");
  const [commentIdsRaw, setCommentIdsRaw] = useState("");
  const [supportCaseIdsRaw, setSupportCaseIdsRaw] = useState("");
  const [feedAdCampaignIdsRaw, setFeedAdCampaignIdsRaw] = useState("");
  const [feedAdRequestIdsRaw, setFeedAdRequestIdsRaw] = useState("");
  const [popupCampaignIdsRaw, setPopupCampaignIdsRaw] = useState("");
  const [popupRequestIdsRaw, setPopupRequestIdsRaw] = useState("");
  const [couponCampaignIdsRaw, setCouponCampaignIdsRaw] = useState("");
  const [chatRoomIdsRaw, setChatRoomIdsRaw] = useState("");
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
  const eligible = useMemo(() => new Set(selectAllEligibleScopes()), []);
  const selectAllChecked =
    eligible.size > 0 && [...eligible].every((k) => selectedScopes.includes(k));

  useEffect(() => {
    const raw = searchParams.get("scopes")?.trim() ?? "";
    if (!raw) return;
    const known = new Set(PRELAUNCH_RESET_SELECTIVE_MATRIX.map((r) => r.key));
    const next = [
      ...new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is PrelaunchResetSelectiveScope => known.has(s as PrelaunchResetSelectiveScope))
      ),
    ];
    if (next.length > 0) setSelectedScopes(next);
  }, [searchParams]);

  const selector = useMemo(
    () => ({
      memberIds: parseIds(memberIdsRaw),
      storeIds: parseIds(storeIdsRaw),
      contentIds: parseIds(contentIdsRaw),
      deliveryAdCampaignIds: parseIds(campaignIdsRaw),
      commentIds: parseIds(commentIdsRaw),
      supportCaseIds: parseIds(supportCaseIdsRaw),
      feedAdCampaignIds: parseIds(feedAdCampaignIdsRaw),
      feedAdRequestIds: parseIds(feedAdRequestIdsRaw),
      popupCampaignIds: parseIds(popupCampaignIdsRaw),
      popupRequestIds: parseIds(popupRequestIdsRaw),
      couponCampaignIds: parseIds(couponCampaignIdsRaw),
      chatRoomIds: parseIds(chatRoomIdsRaw),
    }),
    [
      memberIdsRaw,
      storeIdsRaw,
      contentIdsRaw,
      campaignIdsRaw,
      commentIdsRaw,
      supportCaseIdsRaw,
      feedAdCampaignIdsRaw,
      feedAdRequestIdsRaw,
      popupCampaignIdsRaw,
      popupRequestIdsRaw,
      couponCampaignIdsRaw,
      chatRoomIdsRaw,
    ]
  );

  function invalidatePlan() {
    setPlan(null);
    setExecResult(null);
    setTyped("");
  }

  function toggleScope(key: PrelaunchResetSelectiveScope, enabled: boolean) {
    if (!eligible.has(key)) return;
    setSelectedScopes((prev) => {
      const next = enabled
        ? prev.includes(key)
          ? prev
          : [...prev, key]
        : prev.filter((k) => k !== key);
      return [...next].sort();
    });
    invalidatePlan();
  }

  function toggleSelectAll(on: boolean) {
    setSelectedScopes(on ? selectAllEligibleScopes() : []);
    invalidatePlan();
  }

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
        body: JSON.stringify({ preset, selectedScopes, ...selector }),
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
          selectedScopes,
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
    <div
      className="space-y-4 pb-10"
      data-admin-prelaunch-reset="1"
      data-aro-rst-001="1"
      data-aro-rst-cov-001="1"
    >
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
              "Production 실행은 차단됩니다. Undo 없음. TRUNCATE/전체 wipe/auth 전체 삭제는 지원하지 않습니다. 명시 ID + 선택 범위만 적용됩니다.",
            fallbackEn:
              "Production execute is blocked. No Undo. No TRUNCATE/full wipe/auth mass delete. Explicit IDs + selected scopes only.",
          })}
        </p>
        <p className="mt-2 font-semibold">
          {safeT("admin_prelaunch_reset_scope_limit", {
            fallbackKo:
              "「전체 선택」= 안전하게 선택 가능한 지원 범위만 (DB 전체·Auth 전체·Storage 버킷 전체 아님). 차단/미지원은 강제 포함되지 않습니다.",
            fallbackEn:
              "Select-all = safely selectable supported scopes only (not full DB/Auth/Storage). Blocked/unsupported never force-included.",
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
                  invalidatePlan();
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
        title={
          ko ? "1b. 데이터 유형 선택 (복수 / 전체)" : "1b. Data type selection (multi / select-all)"
        }
      >
        <label
          className="mb-3 flex items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px] font-semibold"
          data-aro-rst-select-all="1"
        >
          <input
            type="checkbox"
            checked={selectAllChecked}
            onChange={(e) => toggleSelectAll(e.target.checked)}
            data-aro-rst-select-all-input="1"
          />
          {ko ? "전체 선택 (지원 범위만)" : "Select all (supported scopes only)"}
        </label>

        <div className="space-y-4" data-aro-rst-scope-matrix="1">
          {GROUP_ORDER.map((group) => {
            const rows = PRELAUNCH_RESET_SELECTIVE_MATRIX.filter((r) => r.group === group);
            if (!rows.length) return null;
            return (
              <div key={group}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sam-muted">
                  {ko ? GROUP_LABEL[group].ko : GROUP_LABEL[group].en}
                </p>
                <ul className="space-y-2">
                  {rows.map((row) => {
                    const badge = supportBadge(row.support, ko);
                    const enabled = eligible.has(row.key);
                    const checked = selectedScopes.includes(row.key);
                    return (
                      <li
                        key={row.key}
                        className="flex flex-wrap items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-surface/50 px-3 py-2 text-[12px]"
                        data-aro-rst-scope={row.key}
                        data-aro-rst-support={row.support}
                      >
                        <label className={`flex min-w-[11rem] flex-1 items-center gap-2 ${enabled ? "" : "opacity-60"}`}>
                          <input
                            type="checkbox"
                            disabled={!enabled}
                            checked={enabled ? checked : false}
                            onChange={(e) => toggleScope(row.key, e.target.checked)}
                            data-aro-rst-scope-input={row.key}
                          />
                          <span className="font-semibold">{ko ? row.labelKo : row.labelEn}</span>
                        </label>
                        <span
                          className={`rounded-ui-rect border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                        >
                          {badge.text}
                        </span>
                        <p className="w-full text-[11px] text-sam-muted">
                          {ko ? row.reasonKo : row.reasonEn}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
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
              onChange={(e) => {
                setMemberIdsRaw(e.target.value);
                invalidatePlan();
              }}
              placeholder="uuid…"
            />
          </label>
          <label className="block text-[12px]">
            Store IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={storeIdsRaw}
              onChange={(e) => {
                setStoreIdsRaw(e.target.value);
                invalidatePlan();
              }}
              placeholder="uuid…"
            />
          </label>
          <label className="block text-[12px]">
            Content IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={contentIdsRaw}
              onChange={(e) => {
                setContentIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Delivery Ad Campaign IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={campaignIdsRaw}
              onChange={(e) => {
                setCampaignIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Comment IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={commentIdsRaw}
              onChange={(e) => {
                setCommentIdsRaw(e.target.value);
                invalidatePlan();
              }}
              placeholder="community_comments uuid…"
            />
          </label>
          <label className="block text-[12px]">
            Support Case IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={supportCaseIdsRaw}
              onChange={(e) => {
                setSupportCaseIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Feed Ad Campaign IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={feedAdCampaignIdsRaw}
              onChange={(e) => {
                setFeedAdCampaignIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Feed Ad Request IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={feedAdRequestIdsRaw}
              onChange={(e) => {
                setFeedAdRequestIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Popup Campaign IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={popupCampaignIdsRaw}
              onChange={(e) => {
                setPopupCampaignIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Popup Request IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={popupRequestIdsRaw}
              onChange={(e) => {
                setPopupRequestIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Coupon Campaign IDs
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={couponCampaignIdsRaw}
              onChange={(e) => {
                setCouponCampaignIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
          <label className="block text-[12px]">
            Chat Room IDs (safe general/group only)
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app p-2 font-mono text-[12px]"
              rows={2}
              value={chatRoomIdsRaw}
              onChange={(e) => {
                setChatRoomIdsRaw(e.target.value);
                invalidatePlan();
              }}
            />
          </label>
        </div>
      </AdminCard>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || selectedScopes.length === 0}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
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
          <p className="mb-2 text-[12px] font-semibold" data-aro-rst-plan-scopes="1">
            {ko ? "선택된 범위: " : "Selected scopes: "}
            {plan.selectedScopes.join(", ") || "(none)"}
          </p>
          {(plan.scopeImpact ?? []).length > 0 ? (
            <ul className="mb-3 space-y-1 text-[11px] font-mono" data-aro-rst-scope-impact="1">
              {plan.scopeImpact.map((s) => (
                <li key={s.scope}>
                  [{s.status}] {s.scope}: db={s.estimatedDbRows} storage={s.storageObjects} auth=
                  {s.authDelete} — {s.detail}
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className="grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4"
            data-admin-prelaunch-reset-counts="1"
          >
            {Object.entries(plan.counts).map(([k, v]) => (
              <div key={k} className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <p className="text-sam-muted">{k}</p>
                <p className="text-[16px] font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div
            className="mt-3 grid gap-2 text-[12px] sm:grid-cols-3"
            data-admin-prelaunch-reset-phase-counts="1"
          >
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <p className="text-sam-muted">DB steps</p>
              <p className="font-bold tabular-nums">
                {plan.deleteSteps.filter((s) => s.phase === "DB").length}
              </p>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <p className="text-sam-muted">Storage objects</p>
              <p className="font-bold tabular-nums">{plan.storageObjects?.length ?? 0}</p>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <p className="text-sam-muted">Auth DELETE / blocked</p>
              <p className="font-bold tabular-nums">
                {(plan.authTargets ?? []).filter((t) => t.action === "DELETE").length}
                {" / "}
                {(plan.authTargets ?? []).filter((t) => t.action === "BLOCKED").length}
              </p>
            </div>
          </div>
          {(plan.authTargets ?? []).length > 0 ? (
            <ul
              className="mt-3 max-h-40 space-y-1 overflow-auto text-[11px] font-mono"
              data-admin-prelaunch-reset-auth="1"
            >
              {plan.authTargets.map((t) => (
                <li key={t.userId}>
                  [{t.action}] {t.userId.slice(0, 8)}… {t.reason}
                </li>
              ))}
            </ul>
          ) : null}
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
          {plan.protectedEntities.length ? (
            <ul className="mt-2 list-disc pl-5 text-[12px] text-sam-muted" data-aro-rst-protected="1">
              {plan.protectedEntities.map((p) => (
                <li key={`${p.kind}:${p.id}`}>
                  PROTECTED: {p.kind} {p.id.slice(0, 8)}… {p.reason ?? ""}
                </li>
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
              fallbackKo: "아래 문구를 정확히 입력하세요 (플랜 카운트·해시·선택 범위 결합).",
              fallbackEn: "Type the exact phrase (bound to plan counts + hash + scopes).",
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
