/**
 * 46단계: 런칭 readiness 유틸
 */

import type { LaunchReadinessArea, LaunchReadinessPhase } from "@/lib/types/launch-readiness";

const AREA_LABELS: Record<LaunchReadinessArea, string> = {
  user_app: "사용자 앱 기능",
  admin_console: "관리자 기능",
  recommendation: "추천 엔진/피드",
  moderation: "신고/제재",
  points_payment: "포인트/결제",
  ads_business: "광고/상점",
  docs_sop: "운영 문서/SOP",
  monitoring_automation: "모니터링/자동화",
  security: "보안/권한",
  deployment: "배포/릴리즈",
};

const PHASE_LABELS: Record<LaunchReadinessPhase, string> = {
  pre_launch: "Pre-Launch",
  launch_day: "Launch Day",
  post_launch: "Post-Launch",
};

const GATE_LABELS: Record<string, string> = {
  must_have: "필수",
  should_have: "권장",
  optional: "선택",
};

const STATUS_LABELS: Record<string, string> = {
  not_ready: "미완료",
  in_progress: "진행중",
  ready: "완료",
  blocked: "차단",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

export function getAreaLabel(area: LaunchReadinessArea): string {
  return AREA_LABELS[area] ?? area;
}

export function getPhaseLabel(phase: LaunchReadinessPhase): string {
  return PHASE_LABELS[phase] ?? phase;
}

export function getGateLabel(gateType: string): string {
  return GATE_LABELS[gateType] ?? gateType;
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function getGoLiveLabel(rec: string): string {
  if (rec === "go") return "Go";
  if (rec === "conditional_go") return "조건부 Go";
  return "No-Go";
}
