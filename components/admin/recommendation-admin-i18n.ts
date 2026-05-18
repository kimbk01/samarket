import type { MessageKey } from "@/lib/i18n/messages";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { HealthStatus, IncidentStatus } from "@/lib/types/recommendation-monitoring";
import type { ExperimentStatus } from "@/lib/types/recommendation-experiment";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

export const ADMIN_REC_SURFACE_KEYS: Record<RecommendationSurface, MessageKey> = {
  home: "admin_rec_surface_home",
  search: "admin_rec_surface_search",
  shop: "admin_rec_surface_shop",
};

export const ADMIN_REC_HEALTH_KEYS: Record<HealthStatus, MessageKey> = {
  healthy: "admin_rec_health_healthy",
  warning: "admin_rec_health_warning",
  critical: "admin_rec_health_critical",
};

export const ADMIN_REC_SEVERITY_KEYS: Record<string, MessageKey> = {
  low: "admin_rec_severity_low",
  medium: "admin_rec_severity_medium",
  high: "admin_rec_severity_high",
  critical: "admin_rec_severity_critical",
};

export const ADMIN_REC_INCIDENT_STATUS_KEYS: Record<IncidentStatus, MessageKey> = {
  open: "admin_rec_incident_status_open",
  acknowledged: "admin_rec_incident_status_acknowledged",
  resolved: "admin_rec_incident_status_resolved",
};

export const ADMIN_REC_INCIDENT_TYPE_KEYS: Record<string, MessageKey> = {
  empty_feed_spike: "admin_rec_incident_type_empty_feed_spike",
  ctr_drop: "admin_rec_incident_type_ctr_drop",
  conversion_drop: "admin_rec_incident_type_conversion_drop",
  fallback_activated: "admin_rec_incident_type_fallback_activated",
  kill_switch_enabled: "admin_rec_incident_type_kill_switch_enabled",
  deployment_failure: "admin_rec_incident_type_deployment_failure",
  section_disabled: "admin_rec_incident_type_section_disabled",
};

export const ADMIN_REC_EXPERIMENT_STATUS_KEYS: Record<ExperimentStatus, MessageKey> = {
  draft: "admin_rec_exp_status_draft",
  running: "admin_rec_exp_status_running",
  paused: "admin_rec_exp_status_paused",
  ended: "admin_rec_exp_status_ended",
};

export const ADMIN_REC_TRAFFIC_ALLOC_KEYS: Record<string, MessageKey> = {
  percentage: "admin_rec_traffic_percentage",
  region_based: "admin_rec_traffic_region_based",
  member_type_based: "admin_rec_traffic_member_type_based",
};

export const ADMIN_REC_ASSIGNED_GROUP_KEYS: Record<string, MessageKey> = {
  control: "admin_rec_group_control",
  variant_a: "admin_rec_group_variant_a",
  variant_b: "admin_rec_group_variant_b",
};

export const ADMIN_REC_LOG_ACTION_KEYS: Record<string, MessageKey> = {
  create: "admin_rec_log_action_create",
  update: "admin_rec_log_action_update",
  start: "admin_rec_log_action_start",
  pause: "admin_rec_log_action_pause",
  end: "admin_rec_log_action_end",
  assign_user: "admin_rec_log_action_assign_user",
  choose_winner: "admin_rec_log_action_choose_winner",
};

export function recSurfaceLabel(t: TFn, surface: RecommendationSurface): string {
  return t(ADMIN_REC_SURFACE_KEYS[surface]);
}

export function recHealthLabel(t: TFn, status: HealthStatus): string {
  return t(ADMIN_REC_HEALTH_KEYS[status]);
}

export function recSeverityLabel(t: TFn, severity: string): string {
  const key = ADMIN_REC_SEVERITY_KEYS[severity];
  return key ? t(key) : severity;
}

export function recIncidentStatusLabel(t: TFn, status: IncidentStatus): string {
  return t(ADMIN_REC_INCIDENT_STATUS_KEYS[status]);
}

export function recIncidentTypeLabel(t: TFn, type: string): string {
  const key = ADMIN_REC_INCIDENT_TYPE_KEYS[type];
  return key ? t(key) : type;
}

export function recExperimentStatusLabel(t: TFn, status: ExperimentStatus): string {
  return t(ADMIN_REC_EXPERIMENT_STATUS_KEYS[status]);
}

export function recTrafficAllocLabel(t: TFn, type: string): string {
  const key = ADMIN_REC_TRAFFIC_ALLOC_KEYS[type];
  return key ? t(key) : type;
}

export function recAssignedGroupLabel(t: TFn, group: string): string {
  const key = ADMIN_REC_ASSIGNED_GROUP_KEYS[group];
  return key ? t(key) : group;
}

export function recLogActionLabel(t: TFn, action: string): string {
  const key = ADMIN_REC_LOG_ACTION_KEYS[action];
  return key ? t(key) : action;
}

const ALERT_METRIC_KEYS: Record<string, MessageKey> = {
  success_rate: "admin_rec_mon_metric_success_rate",
  empty_feed_rate: "admin_rec_mon_metric_empty_feed_rate",
  ctr: "admin_rec_mon_metric_ctr",
  conversion_rate: "admin_rec_mon_metric_conversion_rate",
  fallback_active: "admin_rec_mon_metric_fallback_active",
  kill_switch_active: "admin_rec_mon_metric_kill_switch_active",
};

const ALERT_CHANNEL_KEYS: Record<string, MessageKey> = {
  email: "admin_rec_mon_channel_email",
  slack: "admin_rec_mon_channel_slack",
  sms: "admin_rec_mon_channel_sms",
  dashboard_only: "admin_rec_mon_channel_dashboard_only",
};

const FALLBACK_MODE_KEYS: Record<string, MessageKey> = {
  previous_live_version: "admin_rec_auto_policy_prev_live",
  safe_default_feed: "admin_rec_auto_policy_safe_default",
  local_latest_only: "admin_rec_auto_policy_local_latest",
  static_slots_only: "admin_rec_auto_policy_static_slots",
};

const RECOVERY_MODE_KEYS: Record<string, MessageKey> = {
  normal: "admin_rec_auto_recovery_normal",
  fallback: "admin_rec_auto_recovery_fallback",
  kill_switch: "admin_rec_auto_recovery_kill_switch",
};

const REPORT_PERIOD_KEYS: Record<string, MessageKey> = {
  today: "admin_rec_report_period_today",
  yesterday: "admin_rec_report_period_yesterday",
  last_7_days: "admin_rec_report_period_last_7",
  last_30_days: "admin_rec_report_period_last_30",
};

const REPORT_TYPE_KEYS: Record<string, MessageKey> = {
  daily: "admin_rec_report_type_daily",
  weekly: "admin_rec_report_type_weekly",
  custom: "admin_rec_report_type_custom",
};

const AUTO_ACTION_KEYS: Record<string, MessageKey> = {
  auto_fallback: "admin_rec_auto_action_auto_fallback",
  auto_kill_switch: "admin_rec_auto_action_auto_kill_switch",
  auto_rollback: "admin_rec_auto_action_auto_rollback",
  auto_recovery: "admin_rec_auto_action_auto_recovery",
  send_escalation: "admin_rec_auto_action_send_escalation",
};

export function recAlertMetricLabel(t: TFn, key: string): string {
  const mk = ALERT_METRIC_KEYS[key];
  return mk ? t(mk) : key;
}

export function recAlertChannelLabel(t: TFn, channel: string): string {
  const mk = ALERT_CHANNEL_KEYS[channel];
  return mk ? t(mk) : channel;
}

export function recFallbackModeLabel(t: TFn, mode: string): string {
  const mk = FALLBACK_MODE_KEYS[mode];
  return mk ? t(mk) : mode;
}

export function recRecoveryModeLabel(t: TFn, mode: string): string {
  const mk = RECOVERY_MODE_KEYS[mode];
  return mk ? t(mk) : mode;
}

export function recReportPeriodLabel(t: TFn, period: string): string {
  const mk = REPORT_PERIOD_KEYS[period];
  return mk ? t(mk) : period;
}

export function recReportTypeLabel(t: TFn, type: string): string {
  const mk = REPORT_TYPE_KEYS[type];
  return mk ? t(mk) : type;
}

export function recAutoActionLabel(t: TFn, action: string): string {
  const mk = AUTO_ACTION_KEYS[action];
  return mk ? t(mk) : action;
}

export function recSurfaceOptionLabel(
  t: TFn,
  surface: RecommendationSurface | "all"
): string {
  if (surface === "all") return t("admin_rec_report_surface_all");
  return recSurfaceLabel(t, surface);
}

const ESCALATION_TRIGGER_KEYS: Record<string, MessageKey> = {
  empty_feed_spike: "admin_rec_incident_type_empty_feed_spike",
  ctr_drop: "admin_rec_incident_type_ctr_drop",
  conversion_drop: "admin_rec_incident_type_conversion_drop",
  deployment_failure: "admin_rec_incident_type_deployment_failure",
  fallback_active: "admin_rec_mon_metric_fallback_active",
  kill_switch_active: "admin_rec_mon_metric_kill_switch_active",
};

const LOG_NOTE_LEGACY: Record<string, MessageKey> = {
  "정책 수정": "admin_rec_log_note_policy_update",
  "실험 시작": "admin_rec_log_note_experiment_start",
  "일시중지": "admin_rec_log_note_experiment_pause",
  "실험 종료": "admin_rec_log_note_experiment_end",
  "승자 버전 선택 (placeholder)": "admin_rec_log_note_choose_winner",
  "실험 생성": "admin_rec_log_action_create",
};

export function recEscalationTriggerLabel(t: TFn, trigger: string): string {
  const key = ESCALATION_TRIGGER_KEYS[trigger];
  return key ? t(key) : trigger;
}

export function recAlertSeverityLabel(t: TFn, severity: string): string {
  if (severity === "warning") return recHealthLabel(t, "warning");
  if (severity === "critical") return recHealthLabel(t, "critical");
  return severity;
}

export function recLogNoteLabel(t: TFn, note: string): string {
  if (note.startsWith("admin_rec_log_note_")) return t(note as MessageKey);
  const legacy = LOG_NOTE_LEGACY[note];
  return legacy ? t(legacy) : note;
}

export function recEscalationChannelLabel(t: TFn, channel: string): string {
  if (channel === "dashboard_only") return t("admin_rec_auto_escalation_dashboard");
  if (channel === "admin_call") return t("admin_rec_auto_escalation_admin_call");
  return recAlertChannelLabel(t, channel);
}
