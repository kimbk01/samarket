"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { ExpireSimulationResult } from "@/lib/points/point-expire-db";

interface AdminPointExpireRunPanelProps {
  onRunComplete?: () => void;
  /** 접근표 쓰기 권한 — false 면 소멸 실행 비활성 (서버 가드는 그대로). */
  actionAllowed?: boolean;
}

/** 마닐라(PHT) 오늘 "YYYY-MM-DD" — 기준일 기본값·상한. */
function manilaTodayYmd(): string {
  return formatAdminManilaDate(new Date());
}

/** 미리보기 합계 (적립분 합 — 실제 차감은 회원별 잔액을 넘지 않는다). */
export function expireSimulationTotal(sim: ExpireSimulationResult): number {
  return Object.values(sim.totalByUser).reduce((s, v) => s + (Number(v.total) || 0), 0);
}

/**
 * V3-06: 소멸 실행은 같은 기준일 미리보기를 먼저 본 뒤, 미리보기 총 포인트를 다시 입력해야 실행된다.
 */
export function AdminPointExpireRunPanel({
  onRunComplete,
  actionAllowed = true,
}: AdminPointExpireRunPanelProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";

  const [asOfDate, setAsOfDate] = useState(manilaTodayYmd);
  const [simResult, setSimResult] = useState<ExpireSimulationResult | null>(null);
  const [runSummary, setRunSummary] = useState<{
    totalExpired: number;
    executionCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미리보기는 지금 선택한 기준일의 것일 때만 실행 근거가 된다.
  const previewForDate = simResult && simResult.asOfDate === asOfDate ? simResult : null;
  const previewTotal = previewForDate ? expireSimulationTotal(previewForDate) : 0;
  const canRun = Boolean(previewForDate) && previewTotal > 0 && !loading && actionAllowed;

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await adminFetch("/api/admin/point-expire/simulate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asOfDate }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      result?: ExpireSimulationResult | null;
    };
    if (!res.ok || !json.ok) {
      setError(adminOperatorErrorMessage(json.error || "db_error", ko));
    }
    setSimResult(json.ok ? (json.result ?? null) : null);
    setRunSummary(null);
  };

  const handleRun = async () => {
    if (!previewForDate || !actionAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/point-expire/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate: previewForDate.asOfDate }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        executionIds?: string[];
        totalExpired?: number;
      };
      if (!res.ok || !json.ok) {
        setError(adminOperatorErrorMessage(json.error || "db_error", ko));
        return;
      }
      setRunSummary({
        totalExpired: json.totalExpired ?? 0,
        executionCount: (json.executionIds ?? []).length,
      });
      setSimResult(null);
      setConfirmOpen(false);
      onRunComplete?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="sam-text-body font-medium text-sam-fg"> {t("admin_points_expire_run_title")}
      </h3>
      <form onSubmit={handleSimulate} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted"> {t("admin_points_expire_label_as_of")} (PHT)
          </label>
          <input
            type="date"
            value={asOfDate}
            max={manilaTodayYmd()}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <AdminActionButton type="submit" variant="secondary">
          {t("admin_points_policy_log_action_simulate")}
        </AdminActionButton>
        <AdminActionButton
          variant="danger"
          onClick={() => setConfirmOpen(true)}
          disabled={!canRun}
          title={
            canRun
              ? undefined
              : ko
                ? "같은 기준일 미리보기(시뮬레이션)를 먼저 실행하세요."
                : "Run the simulation for this date first."
          }
        >
          {t("admin_points_expire_btn_run")}
        </AdminActionButton>
      </form>
      {!previewForDate ? (
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "만료 실행 전 같은 기준일로 미리보기(시뮬레이션)를 먼저 확인해야 합니다."
            : "Preview (simulate) the same as-of date before running expiry."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="sam-text-body text-sam-danger">
          {error}
        </p>
      ) : null}
      {simResult && (
        <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft p-3 sam-text-body">
          <p className="font-medium text-sam-fg">
            {t("admin_points_expire_sim_result", { date: simResult.asOfDate })}
          </p>
          <p className="mt-1 text-sam-muted">
            {t("admin_points_expire_sim_policy", {
              policy: simResult.policyName,
              items: simResult.items.length,
              users: Object.keys(simResult.totalByUser).length,
            })}
          </p>
          <p className="mt-1 font-medium tabular-nums text-sam-fg">
            {ko
              ? `미리보기 총 ${formatAdminNumber(expireSimulationTotal(simResult))}P (회원별 잔액을 넘는 만큼은 차감되지 않음)`
              : `Preview total ${formatAdminNumber(expireSimulationTotal(simResult))}P (capped by each member's balance)`}
          </p>
          <ul className="mt-2 list-inside list-disc sam-text-body-secondary text-sam-muted">
            {Object.entries(simResult.totalByUser).map(([uid, v]) => (
              <li key={uid}>
                {t("admin_points_expire_sim_user_line", {
                  nickname: v.nickname,
                  total: v.total,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {runSummary && (
        <div role="status" className="rounded-ui-rect border border-sam-success bg-sam-success-soft p-3 sam-text-body">
          <p className="font-medium text-sam-success">{t("admin_points_expire_run_done")}</p>
          <p className="mt-1 text-sam-fg">
            {t("admin_points_expire_run_summary", {
              points: runSummary.totalExpired,
              count: runSummary.executionCount,
            })}
          </p>
        </div>
      )}
      <AdminActionConfirmDialog
        open={confirmOpen && Boolean(previewForDate)}
        title={ko ? "포인트 만료 실행" : "Run point expiry"}
        description={
          ko
            ? `기준일 ${asOfDate} (PHT) · 회원 ${Object.keys(previewForDate?.totalByUser ?? {}).length}명의 포인트가 실제로 소멸됩니다. 되돌릴 수 없습니다.`
            : `As of ${asOfDate} (PHT) · points of ${Object.keys(previewForDate?.totalByUser ?? {}).length} members will actually expire. This cannot be undone.`
        }
        confirmLabel={t("admin_points_expire_btn_run")}
        cancelLabel={adminCta("cancel", ko)}
        tone="danger"
        confirmMatchText={String(previewTotal)}
        confirmMatchLabel={
          ko
            ? `확인을 위해 미리보기 총 포인트 「${previewTotal}」 를 입력하세요`
            : `Type the preview total 「${previewTotal}」 to confirm`
        }
        pending={loading}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleRun()}
      />
    </div>
  );
}
