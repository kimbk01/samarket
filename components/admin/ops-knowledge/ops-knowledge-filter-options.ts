/** 운영 지식 검색 필터 선택지 — `AdminFilterBar` 의 문서 유형·분류 (「전체」는 AdminFilterSelect 가 붙인다). */
import type { MessageKey } from "@/lib/i18n/messages";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import type { OpsKnowledgeDocType, OpsKnowledgeCategory } from "@/lib/types/ops-knowledge";

export const OPS_KNOWLEDGE_DOC_TYPE_FILTER_OPTIONS: { value: OpsKnowledgeDocType; labelKey: MessageKey }[] = [
  { value: "sop", labelKey: OPS_DOC_TYPE_KEYS.sop },
  { value: "playbook", labelKey: OPS_DOC_TYPE_KEYS.playbook },
  { value: "scenario", labelKey: OPS_DOC_TYPE_KEYS.scenario },
];

export const OPS_KNOWLEDGE_CATEGORY_FILTER_OPTIONS: { value: OpsKnowledgeCategory; labelKey: MessageKey }[] = [
  { value: "incident_response", labelKey: "admin_ops_doc_cat_incident" },
  { value: "deployment", labelKey: "admin_ops_tools_kb_cat_deployment" },
  { value: "rollback", labelKey: "admin_ops_tools_kb_cat_rollback" },
  { value: "moderation", labelKey: "admin_ops_doc_cat_moderation" },
  { value: "recommendation", labelKey: "admin_ops_tools_kb_cat_recommendation" },
  { value: "ads", labelKey: "admin_ops_doc_cat_ads" },
  { value: "points", labelKey: "admin_ops_doc_cat_points" },
  { value: "support", labelKey: "admin_ops_doc_cat_support" },
];
