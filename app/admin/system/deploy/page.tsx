"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";

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
    verifiedAt?: string;
    promotedAt?: string;
    error?: string;
  } | null;
  recent: Array<{ sha: string; status: string; verifiedAt?: string; promotedAt?: string }>;
};

export default function AdminSystemDeployPage() {
  const { safeT } = useI18n();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSha, setConfirmSha] = useState("");
  const [reauthConfirm, setReauthConfirm] = useState("");

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

  async function markVerified() {
    if (!status?.runtimeSha) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deploy/mark-verified", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: status.runtimeSha, layers: ["web"] }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `verify_${res.status}`);
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
        ownerAction?: string | null;
      };
      if (!res.ok || !json.ok) {
        setError(
          [json.error ?? `promote_${res.status}`, json.ownerAction].filter(Boolean).join(" — ")
        );
        return;
      }
      setReauthConfirm("");
      await load();
    } finally {
      setBusy(false);
    }
  }

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

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_runtime", { fallbackKo: "현재 런타임", fallbackEn: "Current runtime" })}
        </h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">SHA</dt>
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
              {safeT("admin_deploy_status_label", { fallbackKo: "검증 상태", fallbackEn: "Verify status" })}
            </dt>
            <dd className="text-sam-fg">{status?.currentRecord?.status ?? "unverified"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">Promote enabled</dt>
            <dd className="text-sam-fg">{status?.promoteEnabled ? "yes" : "no"}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          className={Sam.btn.secondary}
          disabled={busy || !status?.runtimeSha}
          onClick={() => void markVerified()}
        >
          {safeT("admin_deploy_mark_verified", {
            fallbackKo: "검증 완료 표시",
            fallbackEn: "Mark verified",
          })}
        </button>
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
              fallbackKo: '재인증: PROMOTE 입력',
              fallbackEn: 'Re-auth: type PROMOTE',
            })}
          </span>
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 font-mono text-sm"
            value={reauthConfirm}
            onChange={(e) => setReauthConfirm(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className={Sam.btn.primary}
          disabled={
            busy ||
            !status?.runtimeSha ||
            status.currentRecord?.status !== "verified" ||
            confirmSha !== status.runtimeSha ||
            reauthConfirm !== "PROMOTE"
          }
          onClick={() => void promoteWeb()}
        >
          {safeT("admin_deploy_apply_cta", {
            fallbackKo: "운영 적용",
            fallbackEn: "Apply to production",
          })}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-sam-fg">
          {safeT("admin_deploy_history", { fallbackKo: "최근 이력", fallbackEn: "Recent history" })}
        </h2>
        <ul className="space-y-1 text-sm">
          {(status?.recent ?? []).length === 0 ? (
            <li className="text-sam-muted">—</li>
          ) : (
            status?.recent.map((r) => (
              <li key={`${r.sha}-${r.status}-${r.verifiedAt ?? r.promotedAt ?? ""}`} className="font-mono">
                {r.sha.slice(0, 12)} · {r.status}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
