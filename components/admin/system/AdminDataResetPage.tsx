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
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminLoadingState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
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

function executeUnavailableMessage(
  plan: DataResetPlan,
  ko: boolean,
  scopeBlocked: boolean,
  scopeReason: string
): string {
  if (scopeBlocked) return scopeReason;
  if (plan.blockers.length) {
    return ko
      ? `현재 실행이 차단되어 있습니다. (${plan.blockedReason ?? plan.blockers.join(", ")})`
      : `Execute is blocked. (${plan.blockedReason ?? plan.blockers.join(", ")})`;
  }
  if (plan.warnings.includes("production_execute_forbidden")) {
    return ko
      ? "Production 실행은 기본 비활성입니다. 운영 옵트인이 있을 때만 실행할 수 있습니다."
      : "Production execute is off by default. Explicit operational opt-in is required.";
  }
  return ko
    ? "실행 불가 (환경 게이트 / blocker / Production)."
    : "Execute unavailable (env gate / blockers / Production).";
}

export function AdminDataResetPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const initialDomain = (searchParams.get("domain") || "") as DataResetDomain;

  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<DataResetDomainSummaryRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [domain, setDomain] = useState<DataResetDomain | null>(
    initialDomain && DOMAIN_SCOPES[initialDomain] ? initialDomain : null
  );
  const [scopeIdx, setScopeIdx] = useState(0);
  const [entityId, setEntityId] = useState("");
  const [plan, setPlan] = useState<DataResetPlan | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system/data-reset/summary", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: DataResetDomainSummaryRow[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "summary_failed");
        return;
      }
      setRows(data.rows ?? []);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("network_error");
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
    setResultMsg(null);
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
      setResultMsg(
        ko
          ? selectedCapability?.reasonKo ?? "execute_blocked"
          : selectedCapability?.reasonEn ?? "execute_blocked"
      );
      return;
    }
    if (
      !(
        await confirmAdminAction({
          level: "L1",
          ko,
          title: ko ? "초기화를 실행할까요? (복구 불가)" : "Execute reset? (irreversible)",
          confirmLabel: ko ? "초기화 진행" : "Execute",
          destructive: true,
        })
      ).ok
    ) {
      return;
    }
    setBusy(true);
    setResultMsg(null);
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
      if (!res.ok) {
        setResultMsg(data.error ?? data.overall ?? "execute_blocked");
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
      setResultMsg(
        `${data.overall ?? "DONE"}${
          namespaces.length
            ? ko
              ? ` · 클라이언트 무효화 ${clientApplied}/${namespaces.length}`
              : ` · client invalidation ${clientApplied}/${namespaces.length}`
            : data.clientSessionInvalidationRequired
              ? ko
                ? " · 클라이언트 세션 무효화 필요"
                : " · CLIENT SESSION INVALIDATION REQUIRED"
              : ""
        }`
      );
      await loadSummary();
    } catch {
      setResultMsg("network_error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_menu_data_reset"
        description={
          ko
            ? "도메인별 SSOT 초기화 · Preview → Execute · Production 실행은 기본 비활성(별도 옵트인)"
            : "Domain SSOT reset · Preview → Execute · Production execute off by default (opt-in)"
        }
      />

      {error ? (
        <AdminResultBanner ko={ko} result={{ ok: false, code: error }} onClose={() => setError(null)} />
      ) : null}
      {resultMsg ? (
        <p className="rounded border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-fg">
          {adminOperatorErrorMessage(resultMsg, ko)}
        </p>
      ) : null}

      {view === "list" ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          {loading ? (
            <AdminLoadingState ko={ko} />
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{ko ? "도메인" : "Domain"}</th>
                  <th className="px-3 py-2 font-medium">{ko ? "상태" : "Status"}</th>
                  <th className="px-3 py-2 font-medium">{ko ? "데이터 수" : "Count"}</th>
                  <th className="px-3 py-2 font-medium">{ko ? "작업" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.domain} className="border-b border-sam-border/60">
                    <td className="px-3 py-2 text-sam-fg">{ko ? r.labelKo : r.labelEn}</td>
                    <td className="px-3 py-2 text-sam-muted">
                      {r.status === "protected"
                        ? ko
                          ? "보호됨"
                          : "Protected"
                        : r.status === "partial"
                          ? ko
                            ? "부분"
                            : "Partial"
                          : ko
                            ? "정상"
                            : "OK"}
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
              {ko ? "고위험 작업" : "High-risk"}
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
              {ko
                ? "Full Service Reset (고위험 · 실측 미증명)"
                : "Full Service Reset (high-risk · not runtime-proven)"}
            </AdminActionButton>
            <p className="mt-2 text-xs text-sam-muted">
              {ko
                ? "미리보기는 가능합니다. Production 파괴 실행은 기본 비활성이며 운영 실측은 아직 없습니다."
                : "Preview is available. Production destructive execute stays off by default and is not runtime-proven."}
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
            ← {ko ? "목록" : "List"}
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
            {ko ? "작업" : "Operation"}
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
            {ko ? "미리보기 (Preview)" : "Preview"}
          </AdminActionButton>
        </div>
      ) : null}

      {view === "preview" && plan ? (
        <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <AdminActionButton variant="quiet" size="sm" onClick={() => setView("detail")}>
            ← {adminCta("detail", ko)}
          </AdminActionButton>
          <h2 className="text-base font-semibold text-sam-fg">
            {ko ? "초기화 미리보기" : "Reset Preview"}
          </h2>
          <p className="text-xs text-sam-muted">
            planId=<AdminTechId id={plan.planId} copyable={false} /> · hash={plan.planHash} · risk={plan.riskLevel} ·
            confirm L{plan.confirmationLevel}
          </p>

          <section>
            <h3 className="text-sm font-semibold text-sam-fg">{ko ? "삭제 예정" : "Delete"}</h3>
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
            <h3 className="text-sm font-semibold text-sam-fg">{ko ? "소프트/연결 해제" : "Soft / Detach"}</h3>
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
            <h3 className="text-sm font-semibold text-sam-fg">{ko ? "보존" : "Preserve"}</h3>
            <ul className="text-sm text-sam-muted">
              {plan.preserveSummary.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-sam-fg">
              {ko ? "서버 Derived Reset" : "SERVER DERIVED RESET"}
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
              {ko ? "클라이언트 Invalidation" : "CLIENT INVALIDATION"}
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
              {ko ? "실행 차단" : "Execute blocked"}
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
            {ko
              ? "미리보기 성공이 곧 실행 허용을 의미하지 않습니다."
              : "A successful preview does not mean execute is allowed."}
          </p>

          <label className="block text-sm text-sam-fg">
            {ko ? "확인 문구 입력" : "Type confirmation phrase"}
            <input
              className="mt-1 w-full rounded border border-sam-border bg-sam-app px-2 py-1.5 font-mono text-xs"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={plan.typedConfirmationPhrase}
              disabled={scopeExecuteBlocked}
            />
          </label>
          <p className="text-xs text-sam-muted">
            {ko ? "필요 문구:" : "Required:"}{" "}
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
              {ko ? "초기화 진행" : "Execute"}
            </AdminActionButton>
          </div>
          {scopeExecuteBlocked || !plan.executeAllowed || plan.blockers.length > 0 ? (
            <p className="text-xs text-sam-warning">
              {executeUnavailableMessage(
                plan,
                ko,
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
