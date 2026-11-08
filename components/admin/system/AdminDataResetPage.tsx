"use client";

/**
 * Admin Data Reset SSOT UI — list + detail + preview → execute.
 * No card dashboard. Super Admin only (API-enforced).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type {
  DataResetDomain,
  DataResetDomainSummaryRow,
  DataResetPlan,
  DataResetScope,
} from "@/lib/admin/data-reset/types";
import {
  dataResetUiExecuteBlocked,
  resolveDataResetUiCapability,
} from "@/lib/admin/data-reset/ui-capability";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import type { MessageKey } from "@/lib/i18n/messages";

type View = "list" | "detail" | "preview";

const DOMAIN_SCOPES: Record<
  DataResetDomain,
  Array<{ scope: DataResetScope; subtype?: string; labelKo: string; labelEn: string }>
> = {
  community: [
    { scope: "all", labelKo: "커뮤니티 전체 초기화", labelEn: "Reset all community" },
    { scope: "single", labelKo: "개별 게시물", labelEn: "Single post" },
  ],
  market: [
    { scope: "all", labelKo: "거래 전체 초기화", labelEn: "Reset all listings" },
    { scope: "single", labelKo: "개별 리스팅", labelEn: "Single listing" },
  ],
  delivery: [
    {
      scope: "all",
      subtype: "operating",
      labelKo: "운영 상품 전체",
      labelEn: "All operating products",
    },
    {
      scope: "single",
      subtype: "product",
      labelKo: "개별 상품",
      labelEn: "Single product",
    },
    {
      scope: "single",
      subtype: "store",
      labelKo: "매장 운영 데이터 (매장 행 보존)",
      labelEn: "Store operating data (preserve store row)",
    },
  ],
  chat: [
    { scope: "all", labelKo: "채팅 전체 (soft/detach)", labelEn: "All chat (soft/detach)" },
    {
      scope: "type",
      subtype: "general_direct",
      labelKo: "1:1 soft (운영 실행 불가)",
      labelEn: "1:1 soft (execute unavailable)",
    },
    {
      scope: "type",
      subtype: "group",
      labelKo: "그룹 soft (운영 실행 불가)",
      labelEn: "Group soft (execute unavailable)",
    },
    {
      scope: "type",
      subtype: "trade",
      labelKo: "거래방 detach (운영 실행 불가)",
      labelEn: "Trade detach (execute unavailable)",
    },
    {
      scope: "type",
      subtype: "store_order",
      labelKo: "주문방 detach (운영 실행 불가)",
      labelEn: "Order room detach (execute unavailable)",
    },
    { scope: "single", labelKo: "개별 방", labelEn: "Single room" },
  ],
  friend: [
    { scope: "all", labelKo: "친구관계 전체", labelEn: "All friend/block" },
    {
      scope: "user",
      labelKo: "회원 1명 그래프 (운영 실행 불가)",
      labelEn: "One user graph (execute unavailable)",
    },
  ],
  member: [
    {
      scope: "user",
      subtype: "app_data",
      labelKo: "회원 앱 데이터 (auth 보존)",
      labelEn: "Member app data (preserve auth)",
    },
    {
      scope: "user",
      subtype: "auth_delete",
      labelKo: "계정 삭제 (차단됨)",
      labelEn: "Auth delete (blocked)",
    },
  ],
  finance: [{ scope: "all", labelKo: "재무 Hard Reset (미리보기만)", labelEn: "Finance hard (preview only)" }],
  full: [
    {
      scope: "all",
      labelKo: "Full Service Reset (고위험 · 실측 미증명)",
      labelEn: "Full Service Reset (high-risk · not runtime-proven)",
    },
  ],
};

/**
 * 실행 결과 표시 — 실행 결과(SUCCESS/PARTIAL/FAILED)는 오류 코드가 아니므로 오류 문구 변환기를 거치지 않고
 * 「성공·부분 성공·실패」 결과 라벨로 보인다. 오류(차단·사유 누락·네트워크)만 오류 배너로 보인다.
 */
type ExecuteOverall = "SUCCESS" | "PARTIAL" | "FAILED";
type ExecuteOutcome =
  | { kind: "result"; overall: ExecuteOverall; detail: string }
  | { kind: "error"; code: string }
  | { kind: "notice"; text: string };

const EXECUTE_OVERALL_LABEL: Record<ExecuteOverall, { ko: string; en: string; tone: AdminTone }> = {
  SUCCESS: { ...catalogPair("admin_del_alert_th_success"), tone: "success" },
  PARTIAL: { ...catalogPair("admin_partial_success"), tone: "warning" },
  FAILED: { ...catalogPair("admin_meeting_engine_err_generic"), tone: "danger" },
};

function asExecuteOverall(v: unknown): ExecuteOverall | null {
  return v === "SUCCESS" || v === "PARTIAL" || v === "FAILED" ? v : null;
}

function executeUnavailableMessage(
  plan: DataResetPlan,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  scopeBlocked: boolean,
  scopeReason: string
): string {
  if (scopeBlocked) return scopeReason;
  if (plan.blockers.length) {
    return t("admin_system_execute_is_blocked", { reason: plan.blockedReason ?? plan.blockers.join(", ") });
  }
  if (plan.warnings.includes("production_execute_forbidden")) {
    return t("admin_system_production_execute_off_default_explicit_operational");
  }
  return t("admin_system_execute_unavailable_env_gate_blockers_production");
}

export function AdminDataResetPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const initialDomain = (searchParams.get("domain") || "") as DataResetDomain;

  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<DataResetDomainSummaryRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 요약 목록 불러오기 실패 — 동작 오류(error)와 분리. 직전 목록은 지우지 않는다. */
  const [summaryErr, setSummaryErr] = useState<{ code: string; httpStatus?: number } | null>(null);

  const [domain, setDomain] = useState<DataResetDomain | null>(
    initialDomain && DOMAIN_SCOPES[initialDomain] ? initialDomain : null
  );
  const [scopeIdx, setScopeIdx] = useState(0);
  const [entityId, setEntityId] = useState("");
  const [plan, setPlan] = useState<DataResetPlan | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ExecuteOutcome | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setSummaryErr(null);
    try {
      const res = await fetch("/api/admin/system/data-reset/summary", {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: DataResetDomainSummaryRow[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSummaryErr({ code: data.error ?? "summary_failed", httpStatus: res.status });
        return;
      }
      setRows(data.rows ?? []);
      setWarnings(data.warnings ?? []);
    } catch {
      setSummaryErr({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (initialDomain && DOMAIN_SCOPES[initialDomain]) {
      setDomain(initialDomain);
      setView("detail");
    }
  }, [initialDomain]);

  const scopeOptions = domain ? DOMAIN_SCOPES[domain] : [];
  const selectedScope = scopeOptions[scopeIdx] ?? scopeOptions[0];

  const selectedCapability = useMemo(() => {
    if (!domain || !selectedScope) return null;
    return resolveDataResetUiCapability({
      domain,
      scope: selectedScope.scope,
      subtype: selectedScope.subtype,
    });
  }, [domain, selectedScope]);

  const scopeExecuteBlocked = selectedCapability
    ? dataResetUiExecuteBlocked(selectedCapability)
    : false;

  const needsEntity = useMemo(() => {
    const s = selectedScope?.scope;
    return s === "single" || s === "user";
  }, [selectedScope]);

  async function runPreview() {
    if (!domain || !selectedScope) return;
    setBusy(true);
    setOutcome(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/system/data-reset/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          scope: selectedScope.scope,
          subtype: selectedScope.subtype,
          entityId: entityId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        plan?: DataResetPlan;
        oneTimeToken?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.plan) {
        setError(data.error ?? "preview_failed");
        return;
      }
      setPlan(data.plan);
      setOneTimeToken(data.oneTimeToken ?? null);
      setTyped("");
      setView("preview");
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function runExecute() {
    if (!plan || !domain || !selectedScope) return;
    if (scopeExecuteBlocked) {
      const text = ko ? selectedCapability?.reasonKo : selectedCapability?.reasonEn;
      setOutcome(text ? { kind: "notice", text } : { kind: "error", code: "execute_blocked" });
      return;
    }
    // 초기화 실행 = dataReset (L3) — 대상 재입력은 이 화면의 「확인 문구 입력」(서버 typedConfirmation 검증)이 맡고,
    // 확인창은 처리 사유를 받는다. 사유는 실행 API 본문 `reason` → 실행 감사 기록.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("dataReset"),
      ko,
      title: t("admin_system_execute_reset_irreversible"),
      description: t("admin_system_reset_target", {
        domain,
        scope: `${selectedScope.scope}${selectedScope.subtype ? ` (${selectedScope.subtype})` : ""}`,
      }),
      confirmLabel: t("admin_system_execute"),
      destructive: true,
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/admin/system/data-reset/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          scope: selectedScope.scope,
          subtype: selectedScope.subtype,
          entityId: entityId.trim() || undefined,
          planId: plan.planId,
          planHash: plan.planHash,
          planCreatedAt: plan.createdAt,
          typedConfirmation: typed,
          oneTimeToken: oneTimeToken ?? undefined,
          reason: confirmed.reason,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        overall?: string;
        error?: string;
        clientSessionInvalidationRequired?: boolean;
        clientInvalidation?: string[];
        executedCounts?: Record<string, number>;
      };
      const overall = asExecuteOverall(data.overall);
      if (!res.ok) {
        if (overall === "FAILED") {
          setOutcome({ kind: "result", overall, detail: "" });
          await loadSummary();
        } else {
          setOutcome({ kind: "error", code: data.error ?? data.overall ?? "execute_blocked" });
        }
        return;
      }
      let clientApplied = 0;
      const namespaces = data.clientInvalidation ?? [];
      if (namespaces.length) {
        const { applyDataResetClientInvalidation } = await import(
          "@/lib/admin/data-reset/client-invalidation"
        );
        const applied = applyDataResetClientInvalidation(namespaces);
        clientApplied = applied.applied.length;
      }
      const detail = namespaces.length
        ? t("admin_system_client_invalidation", { applied: clientApplied, total: namespaces.length })
        : data.clientSessionInvalidationRequired
          ? t("admin_system_client_session_invalidation_required")
          : "";
      setOutcome({ kind: "result", overall: overall ?? (data.ok ? "SUCCESS" : "PARTIAL"), detail });
      await loadSummary();
    } catch {
      setOutcome({ kind: "error", code: "network_error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_menu_data_reset"
        description={
          t("admin_system_domain_ssot_reset_preview_execute_production")
        }
      />

      {error ? (
        <AdminResultBanner ko={ko} result={{ ok: false, code: error }} onClose={() => setError(null)} />
      ) : null}
      {outcome?.kind === "error" ? (
        <AdminResultBanner ko={ko} result={{ ok: false, code: outcome.code }} onClose={() => setOutcome(null)} />
      ) : null}
      {outcome?.kind === "notice" ? (
        <p className="rounded border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg">{outcome.text}</p>
      ) : null}
      {outcome?.kind === "result" ? (
        <p
          className="flex flex-wrap items-center gap-2 rounded border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg"
          data-data-reset-result={outcome.overall}
        >
          <span>{t("admin_system_result")}</span>
          <AdminToneBadge tone={EXECUTE_OVERALL_LABEL[outcome.overall].tone}>
            {ko ? EXECUTE_OVERALL_LABEL[outcome.overall].ko : EXECUTE_OVERALL_LABEL[outcome.overall].en}
          </AdminToneBadge>
          {outcome.detail ? <span className="text-sam-muted">{outcome.detail}</span> : null}
        </p>
      ) : null}

      {view === "list" ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          {summaryErr ? (
            <AdminErrorState
              ko={ko}
              code={summaryErr.code}
              httpStatus={summaryErr.httpStatus}
              onRetry={() => void loadSummary()}
            />
          ) : null}
          {loading && rows.length === 0 ? (
            <AdminLoadingState ko={ko} />
          ) : rows.length === 0 ? (
            summaryErr ? null : <AdminEmptyState ko={ko} />
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("admin_system_domain")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin_status")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin_system_count")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin_system_action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.domain} className="border-b border-sam-border/60">
                    <td className="px-3 py-2 text-sam-fg">{ko ? r.labelKo : r.labelEn}</td>
                    <td className="px-3 py-2 text-sam-muted">
                      {r.status === "protected"
                        ? t("admin_system_protected")
                        : r.status === "partial"
                          ? t("admin_system_partial")
                          : t("admin_system_ok")}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-sam-fg">
                      {formatAdminNumber(r.primaryCount)}
                    </td>
                    <td className="px-3 py-2">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDomain(r.domain);
                          setScopeIdx(0);
                          setEntityId("");
                          setPlan(null);
                          setView("detail");
                        }}
                      >
                        {adminCta("detail", ko)}
                      </AdminActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {warnings.length ? (
            <p className="border-t border-sam-border px-3 py-2 text-xs text-sam-muted">
              {warnings.slice(0, 3).join(" · ")}
            </p>
          ) : null}

          <div className="border-t border-sam-border px-3 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sam-danger">
              {t("admin_system_high_risk")}
            </p>
            <AdminActionButton
              variant="secondary"
              className="border-sam-danger/40 text-sam-danger"
              onClick={() => {
                setDomain("full");
                setScopeIdx(0);
                setView("detail");
              }}
            >
              {t("admin_system_full_service_reset_high_risk_not")}
            </AdminActionButton>
            <p className="mt-2 text-xs text-sam-muted">
              {t("admin_system_preview_available_production_destructive_execute_stays")}
            </p>
          </div>
        </div>
      ) : null}

      {view === "detail" && domain ? (
        <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <AdminActionButton
            variant="quiet"
            size="sm"
            onClick={() => {
              setView("list");
              setPlan(null);
            }}
          >
            ← {t("admin_system_list")}
          </AdminActionButton>
          <h2 className="text-base font-semibold text-sam-fg">
            {ko
              ? rows.find((r) => r.domain === domain)?.labelKo ?? domain
              : rows.find((r) => r.domain === domain)?.labelEn ?? domain}
          </h2>
          {rows.find((r) => r.domain === domain) ? (
            <ul className="text-sm text-sam-muted">
              {Object.entries(rows.find((r) => r.domain === domain)!.detailCounts).map(
                ([k, v]) => (
                  <li key={k}>
                    {k}: <span className="tabular-nums text-sam-fg">{formatAdminNumber(v)}</span>
                  </li>
                )
              )}
            </ul>
          ) : null}

          <label className="block text-sm text-sam-fg">
            {t("admin_system_operation")}
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-1.5"
              value={scopeIdx}
              onChange={(e) => setScopeIdx(Number(e.target.value))}
            >
              {scopeOptions.map((o, i) => (
                <option key={`${o.scope}-${o.subtype ?? ""}-${i}`} value={i}>
                  {ko ? o.labelKo : o.labelEn}
                </option>
              ))}
            </select>
          </label>

          {needsEntity ? (
            <label className="block text-sm text-sam-fg">
              entityId
              <input
                className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-1.5 font-mono text-xs"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="uuid"
              />
            </label>
          ) : null}

          {selectedCapability ? (
            <p
              className={
                scopeExecuteBlocked
                  ? "rounded border border-sam-warning/40 bg-sam-warning-soft px-2 py-1.5 text-sm text-sam-warning"
                  : "rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm text-sam-muted"
              }
            >
              {ko ? selectedCapability.reasonKo : selectedCapability.reasonEn}
            </p>
          ) : null}

          <AdminActionButton
            variant="primary"
            disabled={busy || (needsEntity && !entityId.trim())}
            onClick={() => void runPreview()}
          >
            {t("admin_system_preview")}
          </AdminActionButton>
        </div>
      ) : null}

      {view === "preview" && plan ? (
        <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <AdminActionButton variant="quiet" size="sm" onClick={() => setView("detail")}>
            ← {adminCta("detail", ko)}
          </AdminActionButton>
          <h2 className="text-base font-semibold text-sam-fg">
            {t("admin_system_reset_preview")}
          </h2>
          <p className="text-xs text-sam-muted">
            planId=<AdminTechId id={plan.planId} copyable={false} /> · hash={plan.planHash} · risk={plan.riskLevel} ·
            confirm L{plan.confirmationLevel}
          </p>

          <section>
            <h3 className="text-sm font-semibold text-sam-fg">{t("admin_system_delete")}</h3>
            <ul className="text-sm text-sam-muted">
              {Object.entries(plan.deleteCounts).map(([k, v]) => (
                <li key={k}>
                  {k}: {formatAdminNumber(v)}
                </li>
              ))}
              {!Object.keys(plan.deleteCounts).length ? <li>—</li> : null}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-sam-fg">{t("admin_system_soft_detach")}</h3>
            <ul className="text-sm text-sam-muted">
              {Object.entries({ ...plan.softDeleteCounts, ...plan.detachCounts }).map(
                ([k, v]) => (
                  <li key={k}>
                    {k}: {formatAdminNumber(v)}
                  </li>
                )
              )}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-sam-fg">{t("admin_system_preserve")}</h3>
            <ul className="text-sm text-sam-muted">
              {plan.preserveSummary.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-sam-fg">
              {t("admin_system_server_derived_reset")}
            </h3>
            <ul className="text-sm text-sam-muted">
              {(plan.derivedStateTargets ?? []).map((t) => (
                <li key={`${t.kind}:${t.identity}`}>
                  {t.ownerDomain.toUpperCase()} {t.kind}: {t.operation}
                  {t.estimatedRows >= 0 ? ` (${t.estimatedRows})` : ""}
                </li>
              ))}
              {!(plan.derivedStateTargets ?? []).length ? <li>—</li> : null}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-sam-fg">
              {t("admin_system_client_invalidation_2")}
            </h3>
            <ul className="text-sm text-sam-muted">
              {(plan.clientInvalidation ?? []).map((ns) => (
                <li key={ns}>{ns}</li>
              ))}
              {!(plan.clientInvalidation ?? []).length ? <li>—</li> : null}
            </ul>
          </section>
          {plan.blockers.length || scopeExecuteBlocked ? (
            <p className="rounded border border-sam-danger/40 bg-sam-danger-soft px-2 py-1 text-sm text-sam-danger">
              {t("admin_system_execute_blocked")}
              {": "}
              {scopeExecuteBlocked
                ? ko
                  ? selectedCapability?.reasonKo
                  : selectedCapability?.reasonEn
                : (plan.blockedReason ?? plan.blockers.join(", "))}
            </p>
          ) : null}
          {plan.warnings.length ? (
            <p className="text-xs text-sam-muted">{plan.warnings.slice(0, 5).join(" · ")}</p>
          ) : null}

          <p className="text-xs text-sam-muted">
            {t("admin_system_successful_preview_does_not_mean_execute")}
          </p>

          <label className="block text-sm text-sam-fg">
            {t("admin_system_type_confirmation_phrase")}
            <input
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-1.5 font-mono text-xs"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={plan.typedConfirmationPhrase}
              disabled={scopeExecuteBlocked}
            />
          </label>
          <p className="text-xs text-sam-muted">
            {t("admin_system_required")}{" "}
            <code className="text-sam-fg">{plan.typedConfirmationPhrase}</code>
          </p>

          <div className="flex flex-wrap gap-2">
            <AdminActionButton variant="secondary" disabled={busy} onClick={() => setView("detail")}>
              {adminCta("cancel", ko)}
            </AdminActionButton>
            <AdminActionButton
              variant="danger"
              disabled={
                busy ||
                scopeExecuteBlocked ||
                !plan.executeAllowed ||
                plan.blockers.length > 0 ||
                typed.trim() !== plan.typedConfirmationPhrase
              }
              onClick={() => void runExecute()}
            >
              {t("admin_system_execute")}
            </AdminActionButton>
          </div>
          {scopeExecuteBlocked || !plan.executeAllowed || plan.blockers.length > 0 ? (
            <p className="text-xs text-sam-warning">
              {executeUnavailableMessage(
                plan,
                t,
                scopeExecuteBlocked,
                (ko ? selectedCapability?.reasonKo : selectedCapability?.reasonEn) ?? ""
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
