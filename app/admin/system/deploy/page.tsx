"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";

type GateRow = {
  gateId: string;
  required: boolean;
  result: string;
  evidenceId: string | null;
  executedAt: string | null;
  detail: string | null;
};

type StatusPayload = {
  ok: boolean;
  runtimeSha: string | null;
  deployTier: string;
  databaseTarget: string;
  projectRef: string | null;
  bannerVariant: string;
  phase1Layers: string[];
  promoteEnabled: boolean;
  currentRecord: {
    sha: string;
    status: string;
    verifiedAt?: string | null;
    promotedAt?: string | null;
    error?: string | null;
    promoteLocked?: boolean;
    promoteLockReason?: string | null;
    pipeline?: {
      allPass: boolean;
      mode: string;
      stages: Record<string, { state: string; detail?: string }>;
    };
  } | null;
  recent: Array<{ sha: string; status: string; verifiedAt?: string | null; promotedAt?: string | null }>;
  evidenceMatrix: {
    ok: boolean;
    blocking: Array<{ gateId: string; status: string; reason: string }>;
    matrix: GateRow[];
  } | null;
  actor: {
    userId: string;
    isDeployOwner: boolean;
    deployOwnerConfigured: boolean;
  };
  productionExecution: {
    promote: { allowed: boolean; reason: string; messageKo: string; messageEn: string };
    rollback: { allowed: boolean; reason: string; messageKo: string; messageEn: string };
  };
  auditHistory: Array<{ at: string; sha: string; action: string; detail?: string }>;
};

const STAGE_LABELS: Record<string, { ko: string; en: string }> = {
  A_github_main: { ko: "A · GitHub main", en: "A · GitHub main" },
  B_vercel_ready: { ko: "B · Vercel Ready", en: "B · Vercel Ready" },
  C_domain_aliased: { ko: "C · 운영 도메인", en: "C · Prod domain" },
  D_prod_smoke: { ko: "D · 기능 스모크", en: "D · Prod smoke" },
};

export default function AdminSystemDeployPage() {
  const { safeT, language } = useI18n();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSha, setConfirmSha] = useState("");
  const [reauthConfirm, setReauthConfirm] = useState("");
  const [confirmOpen, setConfirmOpen] = useState<"verify" | "cancel" | "promote" | "rollback" | null>(
    null
  );

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/deploy/status", { credentials: "include" });
    const json = (await res.json()) as StatusPayload & { error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? `status_${res.status}`);
      return;
    }
    setStatus(json);
    if (json.runtimeSha) setConfirmSha(json.runtimeSha);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = status?.actor?.isDeployOwner === true;
  const ownerConfigured = status?.actor?.deployOwnerConfigured === true;
  const promoteBlocked = status?.productionExecution?.promote?.allowed !== true;
  const rollbackBlocked = status?.productionExecution?.rollback?.allowed !== true;
  const gatesOk = status?.evidenceMatrix?.ok === true;
  const verified = status?.currentRecord?.status === "verified";

  const blockReason = useMemo(() => {
    if (!ownerConfigured) {
      return safeT("admin_deploy_owner_ids_missing", {
        fallbackKo: "DIBAY_DEPLOY_OWNER_IDS 미설정 — Owner 게이트 fail-closed",
        fallbackEn: "DIBAY_DEPLOY_OWNER_IDS unset — Owner gate fail-closed",
      });
    }
    if (!isOwner) {
      return safeT("admin_deploy_owner_only_hint", {
        fallbackKo: "지정 Owner만 검증·승인을 실행할 수 있습니다.",
        fallbackEn: "Only the designated Deploy Owner can verify/approve.",
      });
    }
    return null;
  }, [ownerConfigured, isOwner, safeT]);

  async function runRequiredGates() {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    try {
      const required = (status.evidenceMatrix?.matrix ?? [])
        .filter((g) => g.required)
        .map((g) => g.gateId);
      const ids =
        required.length > 0
          ? required
          : ["runtime_isolation", "auth_login_profile", "test_allowlist_enforced"];
      for (const gateId of ids) {
        const res = await fetch("/api/admin/deploy/run-gate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: status.runtimeSha, gateId }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setError(json.error ?? `gate_${gateId}_${res.status}`);
          return;
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markVerified() {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    setConfirmOpen(null);
    try {
      const res = await fetch("/api/admin/deploy/mark-verified", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha: status.runtimeSha,
          layers: ["web"],
          impactScope: "web_admin_deploy",
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        blocking?: Array<{ gateId: string; reason: string }>;
      };
      if (!res.ok || !json.ok) {
        const extra = json.blocking?.map((b) => `${b.gateId}:${b.reason}`).join(", ");
        setError([json.error ?? `verify_${res.status}`, extra].filter(Boolean).join(" — "));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelVerified() {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    setConfirmOpen(null);
    try {
      const res = await fetch("/api/admin/deploy/cancel-verified", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: status.runtimeSha }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `cancel_${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function mockPipeline(allPass: boolean) {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deploy/mock-pipeline", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: status.runtimeSha, allPass }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `mock_${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function promoteWeb() {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    setConfirmOpen(null);
    try {
      const res = await fetch("/api/admin/deploy/promote-web", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha: status.runtimeSha,
          confirmSha,
          reauthConfirm,
          layers: ["web"],
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        ownerAction?: string | null;
      };
      if (!res.ok || !json.ok) {
        setError(
          [json.error ?? `promote_${res.status}`, json.message, json.ownerAction]
            .filter(Boolean)
            .join(" — ")
        );
        return;
      }
      setReauthConfirm("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    setConfirmOpen(null);
    try {
      const res = await fetch("/api/admin/deploy/rollback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: status.runtimeSha, reauthConfirm: "ROLLBACK" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      setError(
        [json.error ?? `rollback_${res.status}`, json.message].filter(Boolean).join(" — ")
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const stages = status?.currentRecord?.pipeline?.stages;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-sam-fg">
          {safeT("admin_deploy_title", {
            fallbackKo: "배포 · 운영 적용",
            fallbackEn: "Deploy · Promote to production",
          })}
        </h1>
        <p className="text-sm text-sam-muted">
          {safeT("admin_deploy_subtitle", {
            fallbackKo: "1차 범위: Web SHA만. DB·Android·iOS는 별도 승인.",
            fallbackEn: "Phase 1: Web SHA only. DB / Android / iOS need separate approval.",
          })}
        </p>
      </header>

      {error ? (
        <div className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {promoteBlocked ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {language === "en"
            ? status?.productionExecution.promote.messageEn
            : status?.productionExecution.promote.messageKo}
          <span className="mt-1 block font-mono text-xs">
            {status?.productionExecution.promote.reason}
          </span>
        </div>
      ) : null}

      {blockReason ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm text-sam-muted">
          {blockReason}
        </div>
      ) : null}

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_runtime", { fallbackKo: "현재 런타임", fallbackEn: "Current runtime" })}
        </h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">TEST SHA</dt>
            <dd className="font-mono text-sam-fg">{status?.runtimeSha ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">Tier / DB</dt>
            <dd className="text-sam-fg">
              {status?.deployTier ?? "—"} / {status?.databaseTarget ?? "—"}
              {status?.projectRef ? ` (${status.projectRef})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_status_label", {
                fallbackKo: "검증 상태",
                fallbackEn: "Verify status",
              })}
            </dt>
            <dd className="text-sam-fg">{status?.currentRecord?.status ?? "pending_verify"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">
              {safeT("admin_deploy_execution", {
                fallbackKo: "운영 실행",
                fallbackEn: "Prod execution",
              })}
            </dt>
            <dd className="text-sam-fg">{status?.promoteEnabled ? "unlocked" : "BLOCKED"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-sam-fg">
            {safeT("admin_deploy_matrix", {
              fallbackKo: "기능 검증 매트릭스",
              fallbackEn: "Verification matrix",
            })}
          </h2>
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={busy || !status?.runtimeSha || !isOwner}
            onClick={() => void runRequiredGates()}
          >
            {safeT("admin_deploy_run_gates", {
              fallbackKo: "필수 게이트 실행",
              fallbackEn: "Run required gates",
            })}
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {(status?.evidenceMatrix?.matrix ?? []).length === 0 ? (
            <li className="text-sam-muted">—</li>
          ) : (
            status?.evidenceMatrix?.matrix.map((row) => (
              <li
                key={row.gateId}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sam-border/60 pb-2"
              >
                <span className="font-mono text-xs text-sam-fg">
                  {row.gateId}
                  {row.required ? " *" : ""}
                </span>
                <span
                  className={
                    row.result === "pass"
                      ? "text-green-700"
                      : row.result === "fail"
                        ? "text-red-700"
                        : "text-sam-muted"
                  }
                >
                  {row.result.toUpperCase()}
                </span>
                {row.detail ? (
                  <span className="w-full text-xs text-sam-muted">{row.detail}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
        <p className="text-xs text-sam-muted">
          {safeT("admin_deploy_matrix_note", {
            fallbackKo: "* 필수. PASS는 서버 실행 증거만 인정. 수동 PASS 불가.",
            fallbackEn: "* Required. PASS needs server evidence only. No manual PASS.",
          })}
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !status?.runtimeSha || !isOwner || !gatesOk || verified}
          onClick={() => setConfirmOpen("verify")}
        >
          {safeT("admin_deploy_mark_verified", {
            fallbackKo: "검증 완료",
            fallbackEn: "Mark verified",
          })}
        </button>
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !status?.runtimeSha || !isOwner || !verified}
          onClick={() => setConfirmOpen("cancel")}
        >
          {safeT("admin_deploy_cancel_verified", {
            fallbackKo: "검증 취소",
            fallbackEn: "Cancel verified",
          })}
        </button>
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !status?.runtimeSha || !isOwner}
          onClick={() => void mockPipeline(true)}
        >
          {safeT("admin_deploy_mock_pipeline", {
            fallbackKo: "A/B/C/D 모의(TEST)",
            fallbackEn: "Mock A/B/C/D (TEST)",
          })}
        </button>
      </section>

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_pipeline", {
            fallbackKo: "배포 진행 A/B/C/D",
            fallbackEn: "Deploy pipeline A/B/C/D",
          })}
        </h2>
        <ul className="space-y-1 text-sm">
          {Object.entries(STAGE_LABELS).map(([id, label]) => (
            <li key={id} className="flex justify-between gap-2 font-mono text-xs">
              <span>{language === "en" ? label.en : label.ko}</span>
              <span>{stages?.[id]?.state ?? "idle"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_promote_web", {
            fallbackKo: "운영 적용 (Web)",
            fallbackEn: "Promote Web to production",
          })}
        </h2>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_deploy_confirm_sha", {
              fallbackKo: "SHA 재입력 (이중 확인)",
              fallbackEn: "Re-type SHA (double confirm)",
            })}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 font-mono text-sm"
            value={confirmSha}
            onChange={(e) => setConfirmSha(e.target.value.trim())}
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-sam-muted">
            {safeT("admin_deploy_reauth", {
              fallbackKo: "재인증: PROMOTE 입력",
              fallbackEn: "Re-auth: type PROMOTE",
            })}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 font-mono text-sm"
            value={reauthConfirm}
            onChange={(e) => setReauthConfirm(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={Sam.btn.primary}
            disabled={
              busy ||
              promoteBlocked ||
              !isOwner ||
              !status?.runtimeSha ||
              !verified ||
              confirmSha !== status.runtimeSha ||
              reauthConfirm !== "PROMOTE" ||
              status.currentRecord?.promoteLocked === true
            }
            onClick={() => setConfirmOpen("promote")}
            title={
              promoteBlocked
                ? status?.productionExecution.promote.messageKo
                : undefined
            }
          >
            {safeT("admin_deploy_apply_cta", {
              fallbackKo: "운영 적용",
              fallbackEn: "Apply to production",
            })}
          </button>
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={busy || rollbackBlocked || !isOwner || !status?.runtimeSha}
            onClick={() => setConfirmOpen("rollback")}
          >
            {safeT("admin_deploy_rollback", {
              fallbackKo: "이전 버전 복구",
              fallbackEn: "Rollback previous",
            })}
          </button>
        </div>
        {promoteBlocked ? (
          <p className="text-xs text-sam-muted">
            {safeT("admin_deploy_promote_disabled_hint", {
              fallbackKo: "운영 적용·Rollback은 서버에서도 차단됩니다 (Area B BLOCKED).",
              fallbackEn: "Promote/Rollback stay server-blocked (Area B BLOCKED).",
            })}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_history", { fallbackKo: "최근 이력", fallbackEn: "Recent history" })}
        </h2>
        <ul className="space-y-1 text-sm">
          {(status?.auditHistory ?? status?.recent ?? []).length === 0 ? (
            <li className="text-sam-muted">—</li>
          ) : (
            (status?.auditHistory ?? []).map((r, i) => (
              <li key={`${r.sha}-${r.action}-${r.at}-${i}`} className="font-mono text-xs">
                {r.at.slice(0, 19)} · {r.sha.slice(0, 12)} · {r.action}
                {r.detail ? ` · ${r.detail}` : ""}
              </li>
            ))
          )}
        </ul>
      </section>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-lg">
            <p className="text-sm text-sam-fg">
              {confirmOpen === "verify"
                ? safeT("admin_deploy_confirm_verify", {
                    fallbackKo: "필수 게이트 PASS 증거를 확인했습니다. 검증 완료로 표시할까요?",
                    fallbackEn: "Required gates have PASS evidence. Mark verified?",
                  })
                : confirmOpen === "cancel"
                  ? safeT("admin_deploy_confirm_cancel", {
                      fallbackKo: "검증 완료를 취소할까요?",
                      fallbackEn: "Cancel verified status?",
                    })
                  : confirmOpen === "promote"
                    ? safeT("admin_deploy_confirm_promote", {
                        fallbackKo: "운영 main에 이 SHA를 적용할까요? (현재 BLOCKED면 실패합니다)",
                        fallbackEn: "Promote this SHA to production main? (fails if BLOCKED)",
                      })
                    : safeT("admin_deploy_confirm_rollback", {
                        fallbackKo: "운영 Rollback을 요청할까요? (현재 BLOCKED면 실패합니다)",
                        fallbackEn: "Request production rollback? (fails if BLOCKED)",
                      })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={Sam.btn.secondary}
                disabled={busy}
                onClick={() => setConfirmOpen(null)}
              >
                {safeT("admin_deploy_dialog_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
              </button>
              <button
                type="button"
                className={Sam.btn.primary}
                disabled={busy}
                onClick={() => {
                  if (confirmOpen === "verify") void markVerified();
                  else if (confirmOpen === "cancel") void cancelVerified();
                  else if (confirmOpen === "promote") void promoteWeb();
                  else void rollback();
                }}
              >
                {safeT("admin_deploy_dialog_ok", { fallbackKo: "확인", fallbackEn: "Confirm" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
