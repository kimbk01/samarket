import type { MessageKey } from "@/lib/i18n/messages";

export function opsToolsLabel(map: Record<string, MessageKey>, key: string): MessageKey {
  return (map as Record<string, MessageKey>)[key] ?? key;
}

export const OPS_TOOLS_SURFACE_KEYS = {
  all: "admin_ops_tools_surface_all",
  home: "admin_ops_tools_surface_home",
  search: "admin_ops_tools_surface_search",
  shop: "admin_ops_tools_surface_shop",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_PRIORITY_KEYS = {
  low: "admin_ops_tools_priority_low",
  medium: "admin_ops_tools_priority_medium",
  high: "admin_ops_tools_priority_high",
  critical: "admin_ops_tools_priority_critical",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_CHECKLIST_STATUS_KEYS = {
  todo: "admin_ops_tools_checklist_todo",
  in_progress: "admin_ops_tools_checklist_in_progress",
  done: "admin_ops_tools_checklist_done",
  skipped: "admin_ops_tools_checklist_skipped",
  blocked: "admin_ops_tools_checklist_blocked",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_ACTION_STATUS_KEYS = {
  open: "admin_ops_tools_action_open",
  planned: "admin_ops_tools_action_planned",
  in_progress: "admin_ops_tools_action_in_progress",
  done: "admin_ops_tools_action_done",
  archived: "admin_ops_tools_action_archived",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_ACTION_SOURCE_KEYS = {
  checklist: "admin_ops_tools_action_src_checklist",
  retrospective: "admin_ops_tools_action_src_retro",
  incident: "admin_ops_tools_action_src_incident",
  report: "admin_ops_tools_action_src_report",
  deployment: "admin_ops_tools_action_src_deployment",
  manual: "admin_ops_tools_action_src_manual",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_CHECKLIST_CATEGORY_KEYS = {
  monitoring: "admin_ops_tools_cat_monitoring",
  feed: "admin_ops_tools_cat_feed",
  ads: "admin_ops_tools_cat_ads",
  moderation: "admin_ops_tools_cat_moderation",
  reports: "admin_ops_tools_cat_reports",
  automation: "admin_ops_tools_cat_automation",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_NODE_TYPE_KEYS = {
  document: "admin_ops_tools_node_document",
  incident: "admin_ops_tools_node_incident",
  deployment: "admin_ops_tools_node_deployment",
  rollback: "admin_ops_tools_node_rollback",
  feature_flag: "admin_ops_tools_node_feature_flag",
  report: "admin_ops_tools_node_report",
  runbook_execution: "admin_ops_tools_node_runbook_exec",
  action_item: "admin_ops_tools_node_action",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_EDGE_TYPE_KEYS = {
  related_to: "admin_ops_tools_edge_related",
  executed_by: "admin_ops_tools_edge_executed",
  recommended_for: "admin_ops_tools_edge_recommended",
  derived_from: "admin_ops_tools_edge_derived",
  resolved_with: "admin_ops_tools_edge_resolved",
  followup_of: "admin_ops_tools_edge_followup",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_RESOLUTION_KEYS = {
  resolved: "admin_ops_tools_resolution_resolved",
  mitigated: "admin_ops_tools_resolution_mitigated",
  rolled_back: "admin_ops_tools_resolution_rollback",
  fallback_applied: "admin_ops_tools_resolution_fallback",
  escalated: "admin_ops_tools_resolution_escalated",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_PATTERN_STATUS_KEYS = {
  detected: "admin_ops_tools_pattern_detected",
  reviewing: "admin_ops_tools_pattern_reviewing",
  action_created: "admin_ops_tools_pattern_action_created",
  mitigated: "admin_ops_tools_pattern_mitigated",
  monitoring: "admin_ops_tools_pattern_monitoring",
  closed: "admin_ops_tools_pattern_closed",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_PATTERN_LOG_KEYS = {
  detect: "admin_ops_tools_plog_detect",
  update: "admin_ops_tools_plog_update",
  link_document: "admin_ops_tools_plog_link_doc",
  create_action: "admin_ops_tools_plog_create_action",
  mark_mitigated: "admin_ops_tools_plog_mitigated",
  close: "admin_ops_tools_plog_close",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_TREND_KEYS = {
  stable: "admin_ops_tools_trend_stable",
  increasing: "admin_ops_tools_trend_increasing",
  decreasing: "admin_ops_tools_trend_decreasing",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_LEARNING_SOURCE_KEYS = {
  incident: "admin_ops_tools_learn_src_incident",
  runbook: "admin_ops_tools_learn_src_runbook",
  report: "admin_ops_tools_learn_src_report",
  automation: "admin_ops_tools_learn_src_automation",
  manual: "admin_ops_tools_learn_src_manual",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_LEARNING_TYPE_KEYS = {
  repeated_issue: "admin_ops_tools_learn_type_repeat",
  recovery_gap: "admin_ops_tools_learn_type_recovery",
  document_gap: "admin_ops_tools_learn_type_doc",
  automation_gap: "admin_ops_tools_learn_type_auto",
  quality_improvement: "admin_ops_tools_learn_type_quality",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_SUGGESTION_TYPE_KEYS = {
  document_update: "admin_ops_tools_suggest_doc",
  new_runbook: "admin_ops_tools_suggest_runbook",
  automation_rule: "admin_ops_tools_suggest_auto",
  rollback_policy: "admin_ops_tools_suggest_rollback",
  section_disable_rule: "admin_ops_tools_suggest_section",
  alert_threshold_change: "admin_ops_tools_suggest_alert",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_SUGGESTION_STATUS_KEYS = {
  proposed: "admin_ops_tools_suggest_proposed",
  approved: "admin_ops_tools_suggest_approved",
  rejected: "admin_ops_tools_suggest_rejected",
  implemented: "admin_ops_tools_suggest_implemented",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_ROUTINE_CATEGORY_KEYS = {
  monitoring: "admin_ops_tools_routine_cat_monitoring",
  moderation: "admin_ops_tools_routine_cat_moderation",
  content: "admin_ops_tools_routine_cat_content",
  points: "admin_ops_tools_routine_cat_points",
  ads: "admin_ops_tools_routine_cat_ads",
  recommendation: "admin_ops_tools_routine_cat_recommendation",
  docs: "admin_ops_tools_routine_cat_docs",
  automation: "admin_ops_tools_routine_cat_automation",
  reporting: "admin_ops_tools_routine_cat_reporting",
  security: "admin_ops_tools_routine_cat_security",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_PERIOD_KEYS = {
  weekly: "admin_ops_tools_period_weekly",
  monthly: "admin_ops_tools_period_monthly",
  quarterly: "admin_ops_tools_period_quarterly",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_ROUTINE_EXEC_STATUS_KEYS = {
  todo: "admin_ops_tools_routine_todo",
  in_progress: "admin_ops_tools_routine_in_progress",
  done: "admin_ops_tools_routine_done",
  skipped: "admin_ops_tools_routine_skipped",
  overdue: "admin_ops_tools_routine_overdue",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS = {
  pending: "admin_ops_tools_rb_exec_pending",
  in_progress: "admin_ops_tools_rb_exec_in_progress",
  completed: "admin_ops_tools_rb_exec_completed",
  aborted: "admin_ops_tools_rb_exec_aborted",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_RUNBOOK_LINK_KEYS = {
  incident: "admin_ops_tools_rb_link_incident",
  deployment: "admin_ops_tools_rb_link_deployment",
  rollback: "admin_ops_tools_rb_link_rollback",
  feature_flag: "admin_ops_tools_rb_link_feature_flag",
  kill_switch: "admin_ops_tools_rb_link_kill_switch",
  manual: "admin_ops_tools_rb_link_manual",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_RUNBOOK_STEP_STATUS_KEYS = {
  pending: "admin_ops_tools_rb_step_pending",
  in_progress: "admin_ops_tools_rb_step_in_progress",
  done: "admin_ops_tools_rb_step_done",
  skipped: "admin_ops_tools_rb_step_skipped",
  blocked: "admin_ops_tools_rb_step_blocked",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_RUNBOOK_LOG_KEYS = {
  start_execution: "admin_ops_tools_rb_log_start",
  start_step: "admin_ops_tools_rb_log_start_step",
  complete_step: "admin_ops_tools_rb_log_complete_step",
  skip_step: "admin_ops_tools_rb_log_skip_step",
  block_step: "admin_ops_tools_rb_log_block_step",
  add_note: "admin_ops_tools_rb_log_note",
  complete_execution: "admin_ops_tools_rb_log_complete",
  abort_execution: "admin_ops_tools_rb_log_abort",
  write_result: "admin_ops_tools_rb_log_result",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_RESULT_OUTCOME_KEYS = {
  resolved: "admin_ops_tools_outcome_resolved",
  mitigated: "admin_ops_tools_outcome_mitigated",
  rolled_back: "admin_ops_tools_outcome_rollback",
  fallback_applied: "admin_ops_tools_outcome_fallback",
  monitoring_only: "admin_ops_tools_outcome_monitoring",
  escalated: "admin_ops_tools_outcome_escalated",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_ROADMAP_STATUS_KEYS = {
  planned: "admin_ops_tools_roadmap_planned",
  approved: "admin_ops_tools_roadmap_approved",
  in_progress: "admin_ops_tools_roadmap_in_progress",
  blocked: "admin_ops_tools_roadmap_blocked",
  completed: "admin_ops_tools_roadmap_completed",
  deferred: "admin_ops_tools_roadmap_deferred",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_ROADMAP_AREA_KEYS = {
  monitoring: "admin_ops_tools_area_monitoring",
  automation: "admin_ops_tools_area_automation",
  documentation: "admin_ops_tools_area_documentation",
  response: "admin_ops_tools_area_response",
  recommendation_quality: "admin_ops_tools_area_recommendation",
  learning: "admin_ops_tools_area_learning",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_KB_SOURCE_KEYS = {
  incident: "admin_ops_tools_kb_src_incident",
  deployment: "admin_ops_tools_kb_src_deployment",
  rollback: "admin_ops_tools_kb_src_rollback",
  feature_flag: "admin_ops_tools_kb_src_feature_flag",
  kill_switch: "admin_ops_tools_kb_src_kill_switch",
  manual_search: "admin_ops_tools_kb_src_search",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_VIEW_SOURCE_KEYS = {
  search: "admin_ops_tools_view_search",
  incident: "admin_ops_tools_view_incident",
  runbook: "admin_ops_tools_view_runbook",
  manual: "admin_ops_tools_view_manual",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_KB_CATEGORY_KEYS = {
  incident_response: "admin_ops_tools_kb_cat_incident",
  deployment: "admin_ops_tools_kb_cat_deployment",
  rollback: "admin_ops_tools_kb_cat_rollback",
  recommendation: "admin_ops_tools_kb_cat_recommendation",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_MATURITY_SCORE_KEYS = {
  monitoringScore: "admin_ops_tools_maturity_monitoring",
  automationScore: "admin_ops_tools_maturity_automation",
  documentationScore: "admin_ops_tools_maturity_documentation",
  responseScore: "admin_ops_tools_maturity_response",
  recommendationQualityScore: "admin_ops_tools_maturity_recommendation",
  learningScore: "admin_ops_tools_maturity_learning",
} as const satisfies Record<string, MessageKey>;

export const OPS_TOOLS_KPI_KEYS = {
  incidentAvgResolutionMinutes: "admin_ops_tools_kpi_incident_resolution",
  fallbackRate: "admin_ops_tools_kpi_fallback",
  rollbackSuccessRate: "admin_ops_tools_kpi_rollback_success",
  documentFreshnessRate: "admin_ops_tools_kpi_doc_freshness",
  checklistCompletionRate: "admin_ops_tools_kpi_checklist",
  actionCompletionRate: "admin_ops_tools_kpi_action",
  ctrChangeRate: "admin_ops_tools_kpi_ctr",
  conversionRateChange: "admin_ops_tools_kpi_conversion",
} as const satisfies Record<string, MessageKey>;
