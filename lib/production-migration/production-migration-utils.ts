/**
 * 47단계: 프로덕션 전환 유틸 (라벨·도메인별 진행률)
 */

import type {
  ProductionMigrationDomain,
  ProductionTableStatus,
  ProductionLaunchPhase,
  ProductionLaunchArea,
  ProductionGoLiveRecommendation,
} from "@/lib/types/production-migration";

const DOMAIN_LABELS: Record<ProductionMigrationDomain, string> = {
  auth: "Auth",
  user: "User/Profiles",
  product: "Product",
  chat: "Chat",
  report: "Report",
  point: "Point",
  ad: "Ad",
  ops: "Ops",
  recommendation: "Recommendation",
};

const TABLE_STATUS_LABELS: Record<ProductionTableStatus, string> = {
  mock_only: "Mock 전용",
  schema_ready: "스키마 준비",
  query_ready: "쿼리 준비",
  rls_ready: "RLS 준비",
  production_ready: "프로덕션 준비",
};

const PHASE_LABELS: Record<ProductionLaunchPhase, string> = {
  before_cutover: "Cutover 전",
  cutover: "Cutover",
  after_cutover: "Cutover 후",
};

const AREA_LABELS: Record<ProductionLaunchArea, string> = {
  db: "DB",
  auth: "Auth",
  storage: "Storage",
  app: "App",
  admin: "Admin",
  monitoring: "Monitoring",
  backup: "Backup",
  rollback: "Rollback",
};

const RLS_STATUS_LABELS: Record<string, string> = {
  missing: "미작성",
  draft: "초안",
  ready: "준비",
  verified: "검증됨",
};

const INFRA_STATUS_LABELS: Record<string, string> = {
  missing: "없음",
  pending: "대기",
  ready: "준비",
  verified: "검증됨",
};

const LAUNCH_STATUS_LABELS: Record<string, string> = {
  todo: "할 일",
  in_progress: "진행중",
  done: "완료",
  blocked: "차단",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const INFRA_CATEGORY_LABELS: Record<string, string> = {
  storage_bucket: "스토리지 버킷",
  env_secret: "Env/Secret",
  webhook: "Webhook",
  cron: "Cron",
  edge_function: "Edge Function",
  rpc: "RPC",
  trigger: "Trigger",
};

export function getDomainLabel(domain: ProductionMigrationDomain): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

export function getTableStatusLabel(status: ProductionTableStatus): string {
  return TABLE_STATUS_LABELS[status] ?? status;
}

export function getPhaseLabel(phase: ProductionLaunchPhase): string {
  return PHASE_LABELS[phase] ?? phase;
}

export function getAreaLabel(area: ProductionLaunchArea): string {
  return AREA_LABELS[area] ?? area;
}

export function getRlsStatusLabel(status: string): string {
  return RLS_STATUS_LABELS[status] ?? status;
}

export function getInfraStatusLabel(status: string): string {
  return INFRA_STATUS_LABELS[status] ?? status;
}

export function getLaunchStatusLabel(status: string): string {
  return LAUNCH_STATUS_LABELS[status] ?? status;
}

export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function getInfraCategoryLabel(category: string): string {
  return INFRA_CATEGORY_LABELS[category] ?? category;
}

export function getGoLiveLabel(rec: ProductionGoLiveRecommendation): string {
  if (rec === "go") return "Go";
  if (rec === "conditional_go") return "조건부 Go";
  return "No-Go";
}
