/**
 * 36단계: 자동화 조건 평가, dry_run/live 실행, escalation 규칙 조회
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { AutomationActionType } from "@/lib/types/recommendation-automation";
import type { RecommendationAutomationExecutionInput } from "@/lib/recommendation-ops/recommendation-records-contract";
import { getRecommendationAutomationPolicyBySurface } from "@/lib/recommendation-ops/recommendation-ops-state";
import { getRecommendationHealthStatusBySurface } from "@/lib/recommendation-analytics/recommendation-health-status";
import { getRecommendationIncidentCountsBySurface } from "@/lib/recommendation-ops/recommendation-records-summary-state";
import { getFeedMode } from "@/lib/feed-emergency/feed-emergency-utils";
import { enableFallback, enableKillSwitch, disableFallback } from "@/lib/feed-emergency/feed-emergency-utils";
import { rollbackSurface } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { getRecommendationEscalationRules } from "@/lib/recommendation-ops/recommendation-ops-state";
import type { EscalationSeverity, EscalationTriggerType } from "@/lib/types/recommendation-automation";

const SYSTEM_ID = "system";
const SYSTEM_NICK = "자동화";

export interface AutomationEvalResult {
  shouldFallback: boolean;
  shouldKillSwitch: boolean;
  shouldRollback: boolean;
  shouldRecovery: boolean;
  reason: string;
}

/** 임계치 기반 자동화 조건 평가 */
export function evaluateAutomation(surface: RecommendationSurface): AutomationEvalResult {
  const policy = getRecommendationAutomationPolicyBySurface(surface);
  const health = getRecommendationHealthStatusBySurface(surface);
  const mode = getFeedMode(surface);

  const result: AutomationEvalResult = {
    shouldFallback: false,
    shouldKillSwitch: false,
    shouldRollback: false,
    shouldRecovery: false,
    reason: "",
  };

  if (!policy?.isActive || !health) {
    result.reason = "정책 비활성 또는 헬스 없음";
    return result;
  }

  if (mode !== "normal") {
    if (
      policy.autoRecoveryEnabled &&
      mode === "fallback" &&
      health.status === "healthy"
    ) {
      result.shouldRecovery = true;
      result.reason = "복귀 조건: healthy 유지";
    }
    return result;
  }

  if (
    policy.autoFallbackEnabled &&
    (health.emptyFeedRate > policy.emptyFeedRateThreshold ||
      health.successRate < policy.successRateThreshold)
  ) {
    result.shouldFallback = true;
    result.reason = `emptyFeedRate ${health.emptyFeedRate.toFixed(2)} > ${policy.emptyFeedRateThreshold} 또는 successRate ${health.successRate.toFixed(2)} < ${policy.successRateThreshold}`;
    return result;
  }

  /** 이슈 수 = DB 요약 RPC (surface 별 전체 기록 — 예전: 메모리 보관 최대 200건 중에서 셈, R7 후속). */
  const incidentCounts = getRecommendationIncidentCountsBySurface(surface);
  const deploymentFailures = incidentCounts.deploymentFailureUnresolved;
  if (
    policy.autoRollbackEnabled &&
    deploymentFailures >= policy.deploymentFailureThreshold
  ) {
    result.shouldRollback = true;
    result.reason = `배포 실패 이슈 ${deploymentFailures}건 >= ${policy.deploymentFailureThreshold}`;
    return result;
  }

  const criticalOpen = incidentCounts.criticalOpen;
  if (policy.autoKillSwitchEnabled && criticalOpen > 0) {
    result.shouldKillSwitch = true;
    result.reason = `critical 미해결 이슈 ${criticalOpen}건`;
    return result;
  }

  result.reason = "조건 미충족";
  return result;
}

/**
 * 단일 자동 조치 실행 (dry_run: 기록만, live: 실제 상태 변경).
 * 실행 기록은 돌려준 `execution` 을 호출자가 서버에 1건 INSERT 한다 (POST /api/admin/recommendation-records/automation-executions).
 */
export function runAutomationAction(
  surface: RecommendationSurface,
  actionType: AutomationActionType,
  mode: "dry_run" | "live",
  incidentId: string | null,
  reason: string
): {
  status: "success" | "skipped" | "failed";
  beforeState: string;
  afterState: string;
  execution: RecommendationAutomationExecutionInput;
} {
  const beforeState = getFeedMode(surface);
  let afterState = beforeState;

  if (mode === "live") {
    try {
      if (actionType === "auto_fallback") {
        enableFallback(surface, reason, SYSTEM_ID, SYSTEM_NICK);
        afterState = "fallback";
      } else if (actionType === "auto_kill_switch") {
        enableKillSwitch(surface, SYSTEM_ID, SYSTEM_NICK);
        afterState = "kill_switch";
      } else if (actionType === "auto_rollback") {
        const r = rollbackSurface(surface);
        afterState = r.success ? getFeedMode(surface) : beforeState;
      } else if (actionType === "auto_recovery") {
        disableFallback(surface, SYSTEM_ID, SYSTEM_NICK);
        afterState = "normal";
      }
    } catch {
      const failedAfter = getFeedMode(surface);
      return {
        status: "failed",
        beforeState,
        afterState: failedAfter,
        execution: {
          surface,
          incidentId,
          actionType,
          executionMode: mode,
          status: "failed",
          reason,
          beforeState,
          afterState: failedAfter,
        },
      };
    }
  } else {
    afterState = actionType === "auto_fallback" ? "fallback" : actionType === "auto_kill_switch" ? "kill_switch" : actionType === "auto_recovery" ? "normal" : beforeState;
  }

  const status: "success" | "skipped" | "failed" =
    mode === "dry_run" ? "skipped" : "success";
  return {
    status,
    beforeState,
    afterState,
    execution: {
      surface,
      incidentId,
      actionType,
      executionMode: mode,
      status,
      reason,
      beforeState,
      afterState,
    },
  };
}

/** surface에 대해 평가 후 첫 번째 충족 조건 실행 (시뮬레이션/실행용). 실행 기록은 `execution` 으로 돌려준다. */
export function runAutomationForSurface(
  surface: RecommendationSurface,
  mode: "dry_run" | "live"
): AutomationEvalResult & {
  actionTaken?: AutomationActionType;
  /** 실행한 조치의 기록 — 호출자가 서버에 1건 INSERT. 조치 없으면 없음. */
  execution?: RecommendationAutomationExecutionInput;
} {
  const policy = getRecommendationAutomationPolicyBySurface(surface);
  if (!policy?.isActive) {
    return {
      shouldFallback: false,
      shouldKillSwitch: false,
      shouldRollback: false,
      shouldRecovery: false,
      reason: "정책 비활성",
    };
  }

  const effectiveMode = policy.dryRunEnabled ? "dry_run" : mode;
  const evalResult = evaluateAutomation(surface);

  if (evalResult.shouldFallback && policy.autoFallbackEnabled) {
    const run = runAutomationAction(
      surface,
      "auto_fallback",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_fallback", execution: run.execution };
  }
  if (evalResult.shouldRollback && policy.autoRollbackEnabled) {
    const run = runAutomationAction(
      surface,
      "auto_rollback",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_rollback", execution: run.execution };
  }
  if (evalResult.shouldKillSwitch && policy.autoKillSwitchEnabled) {
    const run = runAutomationAction(
      surface,
      "auto_kill_switch",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_kill_switch", execution: run.execution };
  }
  if (evalResult.shouldRecovery && policy.autoRecoveryEnabled) {
    const run = runAutomationAction(
      surface,
      "auto_recovery",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_recovery", execution: run.execution };
  }
  return evalResult;
}

/** severity + triggerType 에 해당하는 escalation 규칙 목록 (stepOrder 순) */
export function getEscalationRulesForTrigger(
  severity: EscalationSeverity,
  triggerType: EscalationTriggerType
): ReturnType<typeof getRecommendationEscalationRules> {
  return getRecommendationEscalationRules({
    severity,
    triggerType,
    isActive: true,
  });
}
