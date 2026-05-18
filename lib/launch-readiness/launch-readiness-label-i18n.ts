import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { LaunchReadinessArea, LaunchReadinessPhase } from "@/lib/types/launch-readiness";

function lrT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const AREA_KEYS: Record<LaunchReadinessArea, MessageKey> = {
  user_app: "lr_area_user_app",
  admin_console: "lr_area_admin_console",
  recommendation: "lr_area_recommendation",
  moderation: "lr_area_moderation",
  points_payment: "lr_area_points_payment",
  ads_business: "lr_area_ads_business",
  docs_sop: "lr_area_docs_sop",
  monitoring_automation: "lr_area_monitoring_automation",
  security: "lr_area_security",
  deployment: "lr_area_deployment",
};

const PHASE_KEYS: Record<LaunchReadinessPhase, MessageKey> = {
  pre_launch: "lr_phase_pre_launch",
  launch_day: "lr_phase_launch_day",
  post_launch: "lr_phase_post_launch",
};

const GATE_KEYS: Record<string, MessageKey> = {
  must_have: "lr_gate_must_have",
  should_have: "lr_gate_should_have",
  optional: "lr_gate_optional",
};

const STATUS_KEYS: Record<string, MessageKey> = {
  not_ready: "lr_status_not_ready",
  in_progress: "lr_status_in_progress",
  ready: "lr_status_ready",
  blocked: "lr_status_blocked",
};

const PRIORITY_KEYS: Record<string, MessageKey> = {
  low: "lr_pri_low",
  medium: "lr_pri_medium",
  high: "lr_pri_high",
  critical: "lr_pri_critical",
};

export function getAreaLabel(area: LaunchReadinessArea): string {
  return lrT(AREA_KEYS[area]);
}

export function getPhaseLabel(phase: LaunchReadinessPhase): string {
  return lrT(PHASE_KEYS[phase]);
}

export function getGateLabel(gateType: string): string {
  const key = GATE_KEYS[gateType];
  return key ? lrT(key) : gateType;
}

export function getStatusLabel(status: string): string {
  const key = STATUS_KEYS[status];
  return key ? lrT(key) : status;
}

export function getPriorityLabel(priority: string): string {
  const key = PRIORITY_KEYS[priority];
  return key ? lrT(key) : priority;
}

export function getGoLiveLabel(rec: string): string {
  if (rec === "go") return lrT("lr_go_live_go");
  if (rec === "conditional_go") return lrT("lr_go_live_conditional");
  return lrT("lr_go_live_no_go");
}
