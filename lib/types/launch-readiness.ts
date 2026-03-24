/**
 * 46단계: 런칭 준비 / 전체 서비스 마감 점검 / 운영 전환 readiness 타입
 */

export type LaunchReadinessArea =
  | "user_app"
  | "admin_console"
  | "recommendation"
  | "moderation"
  | "points_payment"
  | "ads_business"
  | "docs_sop"
  | "monitoring_automation"
  | "security"
  | "deployment";

export type LaunchGateType = "must_have" | "should_have" | "optional";

export type LaunchPriority = "low" | "medium" | "high" | "critical";

export type LaunchReadinessPhase =
  | "pre_launch"
  | "launch_day"
  | "post_launch";

export type LaunchReadinessStatus =
  | "not_ready"
  | "in_progress"
  | "ready"
  | "blocked";

export interface LaunchChecklistTemplate {
  id: string;
  area: LaunchReadinessArea;
  title: string;
  description: string;
  gateType: LaunchGateType;
  defaultPriority: LaunchPriority;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LaunchLinkedType =
  | "action_item"
  | "incident"
  | "document"
  | "deployment"
  | "report"
  | null;

export interface LaunchReadinessItem {
  id: string;
  templateId: string;
  phase: LaunchReadinessPhase;
  area: LaunchReadinessArea;
  title: string;
  gateType: LaunchGateType;
  status: LaunchReadinessStatus;
  priority: LaunchPriority;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  dueDate: string | null;
  blockerReason: string | null;
  note: string;
  linkedType: LaunchLinkedType;
  linkedId: string | null;
  checkedAt: string | null;
  updatedAt: string;
}

export type GoLiveRecommendation = "go" | "conditional_go" | "no_go";

export interface LaunchReadinessSummary {
  overallScore: number;
  mustHaveTotal: number;
  mustHaveReady: number;
  shouldHaveTotal: number;
  shouldHaveReady: number;
  optionalTotal: number;
  optionalReady: number;
  blockedCount: number;
  readyAreas: LaunchReadinessArea[];
  notReadyAreas: LaunchReadinessArea[];
  goLiveRecommendation: GoLiveRecommendation;
  latestUpdatedAt: string | null;
}

export interface LaunchReadinessAreasEntry {
  id: string;
  area: LaunchReadinessArea;
  status: LaunchReadinessStatus;
  totalItems: number;
  readyItems: number;
  blockedItems: number;
  score: number;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  note: string;
}

export type LaunchApproverRole =
  | "product_owner"
  | "ops_owner"
  | "tech_owner"
  | "admin";

export type LaunchApprovalDecision =
  | "approved"
  | "conditional"
  | "rejected";

export interface LaunchApproval {
  id: string;
  phase: LaunchReadinessPhase;
  approverRole: LaunchApproverRole;
  approverAdminId: string | null;
  approverAdminNickname: string | null;
  decision: LaunchApprovalDecision;
  note: string;
  createdAt: string;
}

export type LaunchBlockerActionType =
  | "create_blocker"
  | "update_blocker"
  | "resolve_blocker"
  | "escalate_blocker";

export type LaunchBlockerActorType = "admin" | "system";

export interface LaunchBlockerLog {
  id: string;
  readinessItemId: string;
  actionType: LaunchBlockerActionType;
  actorType: LaunchBlockerActorType;
  actorId: string;
  actorNickname: string;
  note: string;
  createdAt: string;
}
