/**
 * 43단계: 운영 학습 히스토리 / 반복 패턴 / 대응 품질 피드백 타입
 */

export type OpsLearningSourceType =
  | "incident"
  | "runbook"
  | "report"
  | "automation"
  | "manual";

export type OpsLearningSurface = "home" | "search" | "shop" | "all";

export type OpsLearningType =
  | "repeated_issue"
  | "recovery_gap"
  | "document_gap"
  | "automation_gap"
  | "quality_improvement";

export type OpsLearningStatus =
  | "detected"
  | "reviewing"
  | "action_created"
  | "mitigated"
  | "monitoring"
  | "closed";

export type OpsPatternSeverityTrend = "stable" | "increasing" | "decreasing";

export type OpsPatternLogActionType =
  | "detect"
  | "update"
  | "link_document"
  | "create_action"
  | "mark_mitigated"
  | "close";

export type OpsPatternLogActorType = "admin" | "system";

export type OpsSuggestionType =
  | "document_update"
  | "new_runbook"
  | "automation_rule"
  | "rollback_policy"
  | "section_disable_rule"
  | "alert_threshold_change";

export type OpsSuggestionStatus = "proposed" | "approved" | "rejected" | "implemented";

export interface OpsLearningHistory {
  id: string;
  title: string;
  summary: string;
  sourceType: OpsLearningSourceType;
  sourceId: string | null;
  surface: OpsLearningSurface;
  learningType: OpsLearningType;
  status: OpsLearningStatus;
  detectedAt: string;
  updatedAt: string;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  note: string;
}

export interface OpsIssuePattern {
  id: string;
  patternKey: string;
  title: string;
  surface: OpsLearningSurface;
  incidentType: string;
  sectionKey: string | null;
  versionId: string | null;
  category: string | null;
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  avgResolutionMinutes: number | null;
  recurrenceRate: number | null;
  severityTrend: OpsPatternSeverityTrend;
  linkedDocumentId: string | null;
  linkedRunbookDocumentId: string | null;
  status: OpsLearningStatus;
}

export interface OpsResponseQualityFeedback {
  id: string;
  incidentId: string;
  runbookExecutionId: string | null;
  primaryDocumentId: string | null;
  responseQualityScore: number;
  resolutionSpeedScore: number;
  documentFitScore: number;
  automationHelpScore: number | null;
  followupNeeded: boolean;
  feedbackSummary: string;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export interface OpsPatternLog {
  id: string;
  patternId: string;
  actionType: OpsPatternLogActionType;
  actorType: OpsPatternLogActorType;
  actorId: string;
  actorNickname: string;
  note: string;
  createdAt: string;
}

export interface OpsImprovementSuggestion {
  id: string;
  patternId: string;
  suggestionType: OpsSuggestionType;
  title: string;
  description: string;
  status: OpsSuggestionStatus;
  linkedActionItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpsLearningSummary {
  totalPatterns: number;
  openPatterns: number;
  mitigatedPatterns: number;
  avgResponseQualityScore: number;
  avgResolutionSpeedScore: number;
  highRecurrencePatterns: number;
  latestDetectedAt: string | null;
}
