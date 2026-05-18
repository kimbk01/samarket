import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  LaunchWeekChecklistArea,
  LaunchWeekChecklistPriority,
  LaunchWeekChecklistStatus,
  LaunchWeekIssueCategory,
  LaunchWeekIssueSeverity,
  LaunchWeekIssueStatus,
  LaunchWeekStabilityStatus,
} from "@/lib/types/launch-week";

function lwT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const AREA_KEYS: Record<LaunchWeekChecklistArea, MessageKey> = {
  auth: "lw_area_auth",
  product: "lw_area_product",
  image_upload: "lw_area_image_upload",
  chat: "lw_area_chat",
  recommendation: "lw_area_recommendation",
  moderation: "lw_area_moderation",
  point_payment: "lw_area_point_payment",
  ads_business: "lw_area_ads_business",
  admin_ops: "lw_area_admin_ops",
};

const CHECKLIST_STATUS_KEYS: Record<LaunchWeekChecklistStatus, MessageKey> = {
  todo: "lw_check_todo",
  in_progress: "lw_check_in_progress",
  done: "lw_check_done",
  blocked: "lw_check_blocked",
};

const PRIORITY_KEYS: Record<LaunchWeekChecklistPriority, MessageKey> = {
  low: "lw_pri_low",
  medium: "lw_pri_medium",
  high: "lw_pri_high",
  critical: "lw_pri_critical",
};

const ISSUE_STATUS_KEYS: Record<LaunchWeekIssueStatus, MessageKey> = {
  open: "lw_issue_open",
  investigating: "lw_issue_investigating",
  mitigated: "lw_issue_mitigated",
  resolved: "lw_issue_resolved",
};

const SEVERITY_KEYS: Record<LaunchWeekIssueSeverity, MessageKey> = {
  low: "lw_pri_low",
  medium: "lw_pri_medium",
  high: "lw_pri_high",
  critical: "lw_pri_critical",
};

const STABILITY_KEYS: Record<LaunchWeekStabilityStatus, MessageKey> = {
  normal: "lw_stability_normal",
  watch: "lw_stability_watch",
  warning: "lw_stability_warning",
  critical: "lw_stability_critical",
};

export function getAreaLabel(area: LaunchWeekChecklistArea | LaunchWeekIssueCategory): string {
  const key = AREA_KEYS[area as LaunchWeekChecklistArea];
  return key ? lwT(key) : area;
}

export function getChecklistStatusLabel(status: LaunchWeekChecklistStatus): string {
  const key = CHECKLIST_STATUS_KEYS[status];
  return key ? lwT(key) : status;
}

export function getPriorityLabel(priority: LaunchWeekChecklistPriority): string {
  const key = PRIORITY_KEYS[priority];
  return key ? lwT(key) : priority;
}

export function getIssueStatusLabel(status: LaunchWeekIssueStatus): string {
  const key = ISSUE_STATUS_KEYS[status];
  return key ? lwT(key) : status;
}

export function getSeverityLabel(severity: LaunchWeekIssueSeverity): string {
  const key = SEVERITY_KEYS[severity];
  return key ? lwT(key) : severity;
}

export function getStabilityLabel(status: LaunchWeekStabilityStatus): string {
  const key = STABILITY_KEYS[status];
  return key ? lwT(key) : status;
}
