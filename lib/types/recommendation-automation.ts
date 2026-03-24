/**
 * 36단계: 추천 운영 자동화 / escalation / 자동 조치 실행 / recovery 타입
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { FeedFallbackMode } from "@/lib/types/feed-emergency";

export interface RecommendationAutomationPolicy {
  id: string;
  surface: RecommendationSurface;
  isActive: boolean;
  autoFallbackEnabled: boolean;
  autoKillSwitchEnabled: boolean;
  autoRollbackEnabled: boolean;
  autoRecoveryEnabled: boolean;
  dryRunEnabled: boolean;
  emptyFeedRateThreshold: number;
  successRateThreshold: number;
  ctrDropThreshold: number;
  conversionDropThreshold: number;
  deploymentFailureThreshold: number;
  compareWindowMinutes: number;
  fallbackMode: FeedFallbackMode;
  rollbackTargetMode: "previous_live_version" | "latest_stable_version";
  recoveryConditionMode: "manual_only" | "auto_when_healthy";
  updatedAt: string;
  adminMemo: string;
}

export type EscalationSeverity = "warning" | "critical";

export type EscalationTriggerType =
  | "empty_feed_spike"
  | "ctr_drop"
  | "conversion_drop"
  | "deployment_failure"
  | "fallback_active"
  | "kill_switch_active";

export type EscalationChannel =
  | "dashboard_only"
  | "email"
  | "slack"
  | "sms"
  | "admin_call";

export interface RecommendationEscalationRule {
  id: string;
  severity: EscalationSeverity;
  triggerType: EscalationTriggerType;
  stepOrder: number;
  channel: EscalationChannel;
  delayMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AutomationActionType =
  | "auto_fallback"
  | "auto_kill_switch"
  | "auto_rollback"
  | "auto_recovery"
  | "send_escalation";

export type AutomationExecutionMode = "dry_run" | "live";

export type AutomationExecutionStatus = "success" | "skipped" | "failed";

export interface RecommendationAutomationExecution {
  id: string;
  surface: RecommendationSurface;
  incidentId: string | null;
  actionType: AutomationActionType;
  executionMode: AutomationExecutionMode;
  status: AutomationExecutionStatus;
  reason: string;
  beforeState: string;
  afterState: string;
  createdAt: string;
  completedAt: string | null;
}

export interface RecommendationAutomationSummary {
  totalPolicies: number;
  activePolicies: number;
  dryRunPolicies: number;
  executionsToday: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  activeFallbackCount: number;
  activeKillSwitchCount: number;
  latestExecutionAt: string | null;
}

export type RecoveryModeState = "normal" | "fallback" | "kill_switch";

export interface RecommendationRecoveryState {
  id: string;
  surface: RecommendationSurface;
  currentMode: RecoveryModeState;
  recoveryEligible: boolean;
  recoveryReason: string;
  checkedAt: string;
  updatedAt: string;
}
