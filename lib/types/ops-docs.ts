/**
 * 39단계: 운영 SOP / 플레이북 / 대응 시나리오 템플릿 타입
 */

export type OpsDocType = "sop" | "playbook" | "scenario";

export type OpsDocStatus = "draft" | "active" | "archived";

export type OpsDocCategory =
  | "incident_response"
  | "deployment"
  | "rollback"
  | "moderation"
  | "recommendation"
  | "ads"
  | "points"
  | "support";

export type OpsDocumentStepLinkedType =
  | "incident"
  | "deployment"
  | "report"
  | "checklist"
  | "action_item";

export type OpsDocumentLogActionType =
  | "create"
  | "update"
  | "archive"
  | "activate"
  | "duplicate"
  | "approve";

export type OpsDocumentLogActorType = "admin" | "system";

export interface OpsDocument {
  id: string;
  docType: OpsDocType;
  title: string;
  slug: string;
  category: OpsDocCategory;
  status: OpsDocStatus;
  summary: string;
  content: string;
  tags: string[];
  versionLabel: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
  approvedByAdminId: string | null;
  approvedByAdminNickname: string | null;
  adminMemo: string;
}

export interface OpsDocumentStep {
  id: string;
  documentId: string;
  stepOrder: number;
  title: string;
  description: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  linkedType: OpsDocumentStepLinkedType | null;
  linkedId: string | null;
}

export interface OpsDocumentLog {
  id: string;
  documentId: string;
  actionType: OpsDocumentLogActionType;
  actorType: OpsDocumentLogActorType;
  actorId: string;
  actorNickname: string;
  note: string;
  createdAt: string;
}

export interface OpsDocumentSummary {
  totalDocuments: number;
  totalActive: number;
  totalDraft: number;
  totalArchived: number;
  totalPinned: number;
  latestUpdatedAt: string | null;
}
