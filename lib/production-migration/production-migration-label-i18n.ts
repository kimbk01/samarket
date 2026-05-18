import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  ProductionGoLiveRecommendation,
  ProductionLaunchArea,
  ProductionLaunchPhase,
  ProductionMigrationDomain,
  ProductionTableStatus,
} from "@/lib/types/production-migration";

function pmT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const DOMAIN_KEYS: Record<ProductionMigrationDomain, MessageKey> = {
  auth: "prod_mig_domain_auth",
  user: "prod_mig_domain_user",
  product: "prod_mig_domain_product",
  chat: "prod_mig_domain_chat",
  report: "prod_mig_domain_report",
  point: "prod_mig_domain_point",
  ad: "prod_mig_domain_ad",
  ops: "prod_mig_domain_ops",
  recommendation: "prod_mig_domain_recommendation",
};

const TABLE_KEYS: Record<ProductionTableStatus, MessageKey> = {
  mock_only: "prod_mig_table_mock_only",
  schema_ready: "prod_mig_table_schema_ready",
  query_ready: "prod_mig_table_query_ready",
  rls_ready: "prod_mig_table_rls_ready",
  production_ready: "prod_mig_table_production_ready",
};

const PHASE_KEYS: Record<ProductionLaunchPhase, MessageKey> = {
  before_cutover: "prod_mig_phase_before_cutover",
  cutover: "prod_mig_phase_cutover",
  after_cutover: "prod_mig_phase_after_cutover",
};

const AREA_KEYS: Record<ProductionLaunchArea, MessageKey> = {
  db: "prod_mig_area_db",
  auth: "prod_mig_area_auth",
  storage: "prod_mig_area_storage",
  app: "prod_mig_area_app",
  admin: "prod_mig_area_admin",
  monitoring: "prod_mig_area_monitoring",
  backup: "prod_mig_area_backup",
  rollback: "prod_mig_area_rollback",
};

export function getDomainLabel(domain: ProductionMigrationDomain): string {
  return pmT(DOMAIN_KEYS[domain]);
}

export function getTableStatusLabel(status: ProductionTableStatus): string {
  return pmT(TABLE_KEYS[status]);
}

export function getPhaseLabel(phase: ProductionLaunchPhase): string {
  return pmT(PHASE_KEYS[phase]);
}

export function getAreaLabel(area: ProductionLaunchArea): string {
  return pmT(AREA_KEYS[area]);
}

const RLS_KEYS: Record<string, MessageKey> = {
  missing: "prod_mig_rls_missing",
  draft: "prod_mig_rls_draft",
  ready: "prod_mig_rls_ready",
  verified: "prod_mig_rls_verified",
};

const INFRA_STATUS_KEYS: Record<string, MessageKey> = {
  missing: "prod_mig_infra_missing",
  pending: "prod_mig_infra_pending",
  ready: "prod_mig_infra_ready",
  verified: "prod_mig_infra_verified",
};

const LAUNCH_KEYS: Record<string, MessageKey> = {
  todo: "prod_mig_launch_todo",
  in_progress: "prod_mig_launch_in_progress",
  done: "prod_mig_launch_done",
  blocked: "prod_mig_launch_blocked",
};

const PRIORITY_KEYS: Record<string, MessageKey> = {
  low: "prod_mig_pri_low",
  medium: "prod_mig_pri_medium",
  high: "prod_mig_pri_high",
  critical: "prod_mig_pri_critical",
};

const INFRA_CAT_KEYS: Record<string, MessageKey> = {
  storage_bucket: "prod_mig_infra_storage_bucket",
  env_secret: "prod_mig_infra_env_secret",
  webhook: "prod_mig_infra_webhook",
  cron: "prod_mig_infra_cron",
  edge_function: "prod_mig_infra_edge_function",
  rpc: "prod_mig_infra_rpc",
  trigger: "prod_mig_infra_trigger",
};

export function getRlsStatusLabel(status: string): string {
  const key = RLS_KEYS[status];
  return key ? pmT(key) : status;
}

export function getInfraStatusLabel(status: string): string {
  const key = INFRA_STATUS_KEYS[status];
  return key ? pmT(key) : status;
}

export function getLaunchStatusLabel(status: string): string {
  const key = LAUNCH_KEYS[status];
  return key ? pmT(key) : status;
}

export function getPriorityLabel(priority: string): string {
  const key = PRIORITY_KEYS[priority];
  return key ? pmT(key) : priority;
}

export function getInfraCategoryLabel(category: string): string {
  const key = INFRA_CAT_KEYS[category];
  return key ? pmT(key) : category;
}

export function getGoLiveLabel(rec: ProductionGoLiveRecommendation): string {
  if (rec === "go") return "Go";
  if (rec === "conditional_go") return pmT("prod_mig_go_conditional");
  return pmT("prod_mig_go_no");
}
