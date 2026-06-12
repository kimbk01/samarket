"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import type { PointRewardExecution, PointRewardLog } from "@/lib/types/point-execution";
import {
  POINT_EXECUTION_STATUS_LABELS,
  POINT_REWARD_ACTION_LABELS,
} from "@/lib/point-executions/point-execution-utils";
import { getBoardName } from "@/lib/point-policies/point-policy-utils";
import { USER_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";
import { PointRewardLogList } from "./PointRewardLogList";

interface AdminPointExecutionDetailPageProps {
  executionId: string;
}

export function AdminPointExecutionDetailPage({
  executionId,
}: AdminPointExecutionDetailPageProps) {
  const { t } = useI18n();

  const [execution, setExecution] = useState<PointRewardExecution | null>(null);
  const [logs, setLogs] = useState<PointRewardLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await adminFetch(`/api/admin/point-executions/${encodeURIComponent(executionId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        execution?: PointRewardExecution;
        logs?: PointRewardLog[];
      };
      if (!cancelled) {
        setExecution(json.ok ? (json.execution ?? null) : null);
        setLogs(json.ok ? (json.logs ?? []) : []);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId]);

  if (!loaded) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_points_exec_page_detail" backHref="/admin/point-executions" />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_points_processing")}
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_points_exec_page_detail" backHref="/admin/point-executions" />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"> {t("admin_points_exec_not_found")}
        </div>
      </div>
    );
  }

  const statusClass =
    execution.status === "success"
      ? "bg-emerald-50 text-emerald-800"
      : execution.status === "blocked"
        ? "bg-amber-100 text-amber-800"
        : "bg-sam-border-soft text-sam-fg";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_points_exec_page_detail"
        backHref="/admin/point-executions"
      />

      <AdminCard titleKey="admin_points_exec_card_info">
        <dl className="grid grid-cols-1 gap-2 sam-text-body sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd className="font-medium text-sam-fg">{execution.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_exec_label_exec_key")}</dt>
            <dd className="truncate font-mono sam-text-body-secondary text-sam-fg">
              {execution.executionKey}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_th_board")}</dt>
            <dd>{pointBoardLabel(t, execution.boardKey)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_th_action")}</dt>
            <dd>{pointActionTypeLabel(t, execution.actionType)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_th_target")}</dt>
            <dd>
              {execution.targetType} {execution.targetId}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_th_user")}</dt>
            <dd>
              {execution.userNickname} ({execution.userId}) ·{" "}
              {pointUserTypeLabel(t, execution.userType)}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_exec_label_reward_type")}</dt>
            <dd>{execution.rewardType === "fixed" ? t("admin_points_reward_short_fixed") : t("admin_points_reward_short_random")}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_exec_label_points_formula")}</dt>
            <dd>
              {execution.basePoint}P × {execution.appliedMultiplier} ={" "}
              {execution.finalPoint}P
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_th_status")}</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${statusClass}`}
              >
                {pointExecStatusLabel(t, execution.status)}
              </span>
            </dd>
          </div>
          {(execution.capped || execution.cooldownBlocked || execution.duplicateBlocked) && (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{t("admin_points_exec_label_block_reason")}</dt>
              <dd>
                {execution.capped && t("admin_points_exec_block_cap")}
                {execution.cooldownBlocked && t("admin_points_exec_block_cooldown")}
                {execution.duplicateBlocked && t("admin_points_exec_block_duplicate")}
                {execution.reason && `· ${execution.reason}`}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sam-muted">{t("admin_points_exec_label_run_at")}</dt>
            <dd>{new Date(execution.createdAt).toLocaleString("ko-KR")}</dd>
          </div>
          {execution.reversedAt && (
            <div>
              <dt className="text-sam-muted">{t("admin_points_exec_label_reversed_at")}</dt>
              <dd>{new Date(execution.reversedAt).toLocaleString("ko-KR")}</dd>
            </div>
          )}
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_points_exec_card_related_logs">
        <PointRewardLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
