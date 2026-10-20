"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useState } from "react";
import type { PointRewardSimulation } from "@/lib/types/point-policy";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { BOARD_OPTIONS, USER_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

export function PointRewardSimulator() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState("general");
  const [actionType, setActionType] = useState<"write" | "comment">("write");
  const [userType, setUserType] = useState<"free" | "premium">("free");
  const [currentPointBalance, setCurrentPointBalance] = useState(100);
  const [result, setResult] = useState<PointRewardSimulation | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorCode(null);
    try {
      const res = await adminFetch("/api/admin/point-policies/simulate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardKey, actionType, userType, currentPointBalance }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: PointRewardSimulation;
      };
      if (!res.ok || !json.ok) {
        setResult(null);
        setErrorCode(json.error ?? "action_failed");
        return;
      }
      setResult(json.result ?? null);
    } catch {
      setResult(null);
      setErrorCode("network_error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSimulate} className="space-y-3">
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_th_board")}
          </label>
          <select
            value={boardKey}
            onChange={(e) => setBoardKey(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {BOARD_OPTIONS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_th_action")}
          </label>
          <select
            value={actionType}
            onChange={(e) =>
              setActionType(e.target.value as "write" | "comment")
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="write">{t("admin_points_policy_th_write")}</option>
            <option value="comment">{t("admin_points_policy_th_comment")}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_points_th_user")} {t("admin_points_th_type")}
          </label>
          <select
            value={userType}
            onChange={(e) =>
              setUserType(e.target.value as "free" | "premium")
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            <option value="free">{USER_TYPE_LABELS.free}</option>
            <option value="premium">{USER_TYPE_LABELS.premium}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg"> {t("admin_points_policy_sim_label_balance")}
          </label>
          <input
            type="number"
            min={0}
            value={currentPointBalance}
            onChange={(e) =>
              setCurrentPointBalance(parseInt(e.target.value, 10) || 0)
            }
            className="w-32 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <AdminActionButton type="submit" variant="primary" disabled={busy}>
          {t("admin_points_policy_log_action_simulate")}
        </AdminActionButton>
      </form>

      {errorCode ? (
        <AdminResultBanner ko={ko} result={{ ok: false, code: errorCode }} onClose={() => setErrorCode(null)} />
      ) : null}

      {result && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_points_policy_sim_result")}</h3>
          <dl className="mt-2 space-y-1 sam-text-body">
            <div className="flex justify-between">
              <dt className="text-sam-muted">{t("admin_points_policy_sim_reward_points")}</dt>
              <dd className="font-semibold tabular-nums text-sam-fg">
                +{formatAdminNumber(result.rewardPoint)}P
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sam-muted">{t("admin_points_policy_sim_multiplier")}</dt>
              <dd>{result.appliedMultiplier}x</dd>
            </div>
            {result.capped && (
              <div className="text-sam-warning">{t("admin_points_policy_sim_cap_applied")}</div>
            )}
            {result.cooldownBlocked && (
              <div className="text-sam-warning">{t("admin_points_policy_sim_cooldown_blocked")}</div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
