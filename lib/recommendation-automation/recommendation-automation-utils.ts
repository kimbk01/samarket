/**
 * 36단계: 자동화 조건 평가, dry_run/live 실행, escalation 규칙 조회
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { AutomationActionType } from "@/lib/types/recommendation-automation";
import { getRecommendationAutomationPolicyBySurface } from "./mock-recommendation-automation-policies";
import { getRecommendationHealthStatusBySurface } from "@/lib/recommendation-monitoring/mock-recommendation-health-statuses";
import { getRecommendationIncidents } from "@/lib/recommendation-monitoring/mock-recommendation-incidents";
import { addRecommendationAutomationExecution } from "./mock-recommendation-automation-executions";
import { getFeedMode } from "@/lib/feed-emergency/feed-emergency-utils";
import { enableFallback, enableKillSwitch, disableFallback } from "@/lib/feed-emergency/feed-emergency-utils";
import { rollbackSurface } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { getRecommendationEscalationRules } from "./mock-recommendation-escalation-rules";
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

  const incidents = getRecommendationIncidents({ surface });
  const deploymentFailures = incidents.filter(
    (i) => i.incidentType === "deployment_failure" && i.status !== "resolved"
  );
  if (
    policy.autoRollbackEnabled &&
    deploymentFailures.length >= policy.deploymentFailureThreshold
  ) {
    result.shouldRollback = true;
    result.reason = `배포 실패 이슈 ${deploymentFailures.length}건 >= ${policy.deploymentFailureThreshold}`;
    return result;
  }

  const criticalOpen = incidents.filter(
    (i) => i.severity === "critical" && i.status === "open"
  );
  if (policy.autoKillSwitchEnabled && criticalOpen.length > 0) {
    result.shouldKillSwitch = true;
    result.reason = `critical 미해결 이슈 ${criticalOpen.length}건`;
    return result;
  }

  result.reason = "조건 미충족";
  return result;
}

/** 단일 자동 조치 실행 (dry_run: 기록만, live: 실제 상태 변경) */
export function runAutomationAction(
  surface: RecommendationSurface,
  actionType: AutomationActionType,
  mode: "dry_run" | "live",
  incidentId: string | null,
  reason: string
): { status: "success" | "skipped" | "failed"; beforeState: string; afterState: string } {
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
      addRecommendationAutomationExecution({
        surface,
        incidentId,
        actionType,
        executionMode: mode,
        status: "failed",
        reason,
        beforeState,
        afterState: getFeedMode(surface),
        completedAt: new Date().toISOString(),
      });
      return { status: "failed", beforeState, afterState: getFeedMode(surface) };
    }
  } else {
    afterState = actionType === "auto_fallback" ? "fallback" : actionType === "auto_kill_switch" ? "kill_switch" : actionType === "auto_recovery" ? "normal" : beforeState;
  }

  const status: "success" | "skipped" | "failed" =
    mode === "dry_run" ? "skipped" : "success";
  addRecommendationAutomationExecution({
    surface,
    incidentId,
    actionType,
    executionMode: mode,
    status,
    reason,
    beforeState,
    afterState,
    completedAt: new Date().toISOString(),
  });
  return { status, beforeState, afterState };
}

/** surface에 대해 평가 후 첫 번째 충족 조건 실행 (시뮬레이션/실행용) */
export function runAutomationForSurface(
  surface: RecommendationSurface,
  mode: "dry_run" | "live"
): AutomationEvalResult & { actionTaken?: AutomationActionType } {
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
    runAutomationAction(
      surface,
      "auto_fallback",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_fallback" };
  }
  if (evalResult.shouldRollback && policy.autoRollbackEnabled) {
    runAutomationAction(
      surface,
      "auto_rollback",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_rollback" };
  }
  if (evalResult.shouldKillSwitch && policy.autoKillSwitchEnabled) {
    runAutomationAction(
      surface,
      "auto_kill_switch",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_kill_switch" };
  }
  if (evalResult.shouldRecovery && policy.autoRecoveryEnabled) {
    runAutomationAction(
      surface,
      "auto_recovery",
      effectiveMode,
      null,
      evalResult.reason
    );
    return { ...evalResult, actionTaken: "auto_recovery" };
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
