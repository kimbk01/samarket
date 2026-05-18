import type { MessageKey } from "@/lib/i18n/messages";
import type { OpsDocType, OpsDocStatus, OpsDocCategory } from "@/lib/types/ops-docs";
import type { OpsDocumentStepLinkedType } from "@/lib/types/ops-docs";

export const OPS_DOC_TYPE_KEYS: Record<OpsDocType, MessageKey> = {
  sop: "admin_ops_doc_type_sop",
  playbook: "admin_ops_doc_type_playbook",
  scenario: "admin_ops_doc_type_scenario",
};

export const OPS_DOC_STATUS_KEYS: Record<OpsDocStatus, MessageKey> = {
  draft: "admin_ops_doc_status_draft",
  active: "admin_ops_doc_status_active",
  archived: "admin_ops_doc_status_archived",
};

/** Table badges — shorter incident label */
export const OPS_DOC_CATEGORY_TABLE_KEYS: Record<OpsDocCategory, MessageKey> = {
  incident_response: "admin_ops_doc_cat_incident_short",
  deployment: "admin_ops_doc_cat_deployment",
  rollback: "admin_ops_doc_cat_rollback",
  moderation: "admin_ops_doc_cat_moderation",
  recommendation: "admin_ops_doc_cat_recommendation",
  ads: "admin_ops_doc_cat_ads",
  points: "admin_ops_doc_cat_points",
  support: "admin_ops_doc_cat_support",
};

export const OPS_DOC_CATEGORY_KEYS: Record<OpsDocCategory, MessageKey> = {
  incident_response: "admin_ops_doc_cat_incident",
  deployment: "admin_ops_doc_cat_deployment",
  rollback: "admin_ops_doc_cat_rollback",
  moderation: "admin_ops_doc_cat_moderation",
  recommendation: "admin_ops_doc_cat_recommendation",
  ads: "admin_ops_doc_cat_ads",
  points: "admin_ops_doc_cat_points",
  support: "admin_ops_doc_cat_support",
};

export const OPS_DOC_LOG_ACTION_KEYS: Record<string, MessageKey> = {
  create: "admin_ops_doc_log_create",
  update: "admin_ops_doc_log_update",
  archive: "admin_ops_doc_log_archive",
  activate: "admin_ops_doc_log_activate",
  duplicate: "admin_ops_doc_log_duplicate",
  approve: "admin_ops_doc_log_approve",
};

export const OPS_DOC_STEP_LINK_KEYS: Record<OpsDocumentStepLinkedType, MessageKey> = {
  incident: "admin_ops_doc_link_incident",
  deployment: "admin_ops_doc_link_deployment",
  report: "admin_ops_doc_link_report",
  checklist: "admin_ops_doc_link_checklist",
  action_item: "admin_ops_doc_link_action",
};
