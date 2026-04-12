"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getPointRewardExecutionById } from "@/lib/point-executions/mock-point-reward-executions";
import { getPointRewardLogsByExecutionId } from "@/lib/point-executions/mock-point-reward-logs";
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
  const execution = useMemo(
    () => getPointRewardExecutionById(executionId),
    [executionId]
  );
  const logs = useMemo(
    () => getPointRewardLogsByExecutionId(executionId),
    [executionId]
  );

  if (!execution) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="포인트 실행 상세" backHref="/admin/point-executions" />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          해당 실행을 찾을 수 없습니다.
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
        title="포인트 실행 상세"
        backHref="/admin/point-executions"
      />

      <AdminCard title="실행 정보">
        <dl className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd className="font-medium text-sam-fg">{execution.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">실행 키</dt>
            <dd className="truncate font-mono text-[13px] text-sam-fg">
              {execution.executionKey}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">게시판</dt>
            <dd>{getBoardName(execution.boardKey)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">행동</dt>
            <dd>{POINT_REWARD_ACTION_LABELS[execution.actionType]}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">대상</dt>
            <dd>
              {execution.targetType} {execution.targetId}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">사용자</dt>
            <dd>
              {execution.userNickname} ({execution.userId}) ·{" "}
              {USER_TYPE_LABELS[execution.userType]}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">보상 유형</dt>
            <dd>{execution.rewardType === "fixed" ? "고정" : "확률형"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">기본 P / 배율 / 최종 P</dt>
            <dd>
              {execution.basePoint}P × {execution.appliedMultiplier} ={" "}
              {execution.finalPoint}P
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">상태</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${statusClass}`}
              >
                {POINT_EXECUTION_STATUS_LABELS[execution.status]}
              </span>
            </dd>
          </div>
          {(execution.capped || execution.cooldownBlocked || execution.duplicateBlocked) && (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">차단 사유</dt>
              <dd>
                {execution.capped && "상한 도달 "}
                {execution.cooldownBlocked && "쿨다운 "}
                {execution.duplicateBlocked && "중복 "}
                {execution.reason && `· ${execution.reason}`}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sam-muted">실행 일시</dt>
            <dd>{new Date(execution.createdAt).toLocaleString("ko-KR")}</dd>
          </div>
          {execution.reversedAt && (
            <div>
              <dt className="text-sam-muted">회수 일시</dt>
              <dd>{new Date(execution.reversedAt).toLocaleString("ko-KR")}</dd>
            </div>
          )}
        </dl>
      </AdminCard>

      <AdminCard title="관련 지급/회수 로그">
        <PointRewardLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
